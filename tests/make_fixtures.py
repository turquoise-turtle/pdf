# /// script
# requires-python = ">=3.11"
# dependencies = ["pikepdf", "pymupdf", "reportlab"]
# ///
"""Make test PDFs with qpdf (via pikepdf) and MuPDF (via PyMuPDF), independently of PDFium, the engine the site uses.
Real PDFs come from many programs, so encrypted files are written by both, each with its own internal layout.
Never make or save fixtures with PDFium or the page: tests/test.mjs refuses to run if a fixture lacks its maker's signature or has PDFium's.
MuPDF-made files are never used to test MuPDF (the comparison engine in tests/mupdf.mjs), for the same reason.

uv run tests/make_fixtures.py
    Regenerate the committed set in tests/fixtures. Only needed when adding a case.
uv run tests/make_fixtures.py --fresh DIR --seed N
    Write a new random set (random passwords and encryption types) plus manifest.json to DIR.
    tests/test.mjs does this on every run when uv is installed, so the page isn't only tested on files it has seen before.
"""
import argparse
import json
import random
import shutil
import sys
from pathlib import Path

import pikepdf
import pymupdf
from reportlab.lib.pagesizes import A4
from reportlab.pdfgen import canvas

HERE = Path(__file__).parent
OUT = HERE / "fixtures"
NO_RIGHTS = dict(print_lowres=False, print_highres=False, extract=False, modify_other=False)
MUPDF_ENCRYPTION = {2: pymupdf.PDF_ENCRYPT_RC4_40, 3: pymupdf.PDF_ENCRYPT_RC4_128, 4: pymupdf.PDF_ENCRYPT_AES_128, 6: pymupdf.PDF_ENCRYPT_AES_256}


def encrypt(src: Path, dest: Path, user: str, owner: str, r: int, maker: str) -> None:
    """Encrypt src with revision r (2=RC4-40, 3=RC4-128, 4=AES-128, 6=AES-256) using qpdf or MuPDF, with no permissions."""
    if maker == "qpdf":
        with pikepdf.open(src) as pdf:
            pdf.save(dest, encryption=pikepdf.Encryption(user=user, owner=owner, R=r, aes=r >= 4, metadata=r >= 4, allow=pikepdf.Permissions(**NO_RIGHTS)))
    else:
        with pymupdf.open(src) as doc:
            doc.save(dest, encryption=MUPDF_ENCRYPTION[r], user_pw=user, owner_pw=owner, permissions=0)


def fresh(out: Path, seed: int, count: int = 12) -> None:
    """Random encrypted copies of plain.pdf from a random maker. R2-R4 passwords are limited to ASCII, as the PDF spec requires."""
    rng = random.Random(seed)
    ascii_chars = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789 !#$%&()*+,-./:;<=>?@[]^_{|}~"
    unicode_chars = ascii_chars + "àéîõüßñçøåÆŒ日本語한국어中文Ωπλ"
    out.mkdir(parents=True, exist_ok=True)
    manifest = {}
    for i in range(count):
        r = rng.choice([2, 3, 4, 6])
        owner_only = rng.random() < 0.3
        chars = unicode_chars if r == 6 else ascii_chars
        password = "" if owner_only else "".join(rng.choice(chars) for _ in range(rng.randint(1, 32)))
        maker = rng.choice(["qpdf", "mupdf"])
        name = f"fresh-{i}-{maker}-r{r}{'-owneronly' if owner_only else ''}.pdf"
        encrypt(HERE / "fixtures" / "plain.pdf", out / name, password, f"owner{rng.random()}", r, maker)
        manifest[name] = {"password": password, "maker": maker}
    (out / "manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=1))


args = argparse.ArgumentParser()
args.add_argument("--fresh", type=Path)
args.add_argument("--seed", type=int, default=0)
args = args.parse_args()
if args.fresh:
    fresh(args.fresh, args.seed)
    sys.exit()

shutil.rmtree(OUT, ignore_errors=True)
OUT.mkdir()

# plain.pdf: 3 pages of text, a link, bookmarks and a form field, so tests can check nothing is lost.
plain = OUT / "plain.pdf"
c = canvas.Canvas(str(plain), pagesize=A4)
for n in range(1, 4):
    c.setFont("Helvetica", 18)
    c.drawString(72, 760, f"Unlock test page {n}")
    c.setFont("Helvetica", 11)
    for i in range(30):
        c.drawString(72, 720 - i * 18, f"Line {i + 1} of page {n}: the quick brown fox jumps over the lazy dog.")
    c.bookmarkPage(f"p{n}")
    c.addOutlineEntry(f"Page {n}", f"p{n}", level=0)
    if n == 1:
        c.drawString(72, 120, "Link: https://example.com/")
        c.linkURL("https://example.com/", (72, 115, 300, 132), relative=0)
        c.acroForm.textfield(name="student_name", tooltip="Name", x=72, y=60, width=200, height=20, value="Kim")
    c.showPage()
c.save()

# Encrypted variants: every standard revision, with an open password ("user") or restrictions only.
# qpdf-made files go in fixtures/, MuPDF-made ones in fixtures/mupdf/ (prefixed, so names stay unique in the page's list).
(OUT / "mupdf").mkdir()
for name, user, r in [
    ("r2-rc4-40-user", "user", 2),
    ("r3-rc4-128-user", "user", 3),
    ("r4-aes128-user", "user", 4),
    ("r6-aes256-user", "user", 6),
    ("r6-aes256-unicode", "pässwörd-日本", 6),
    ("r3-rc4-128-owneronly", "", 3),
    ("r6-aes256-owneronly", "", 6),
]:
    encrypt(plain, OUT / f"{name}.pdf", user, "owner", r, "qpdf")
    encrypt(plain, OUT / "mupdf" / f"mupdf-{name}.pdf", user, "owner", r, "mupdf")

# Damaged but recoverable: broken cross-reference pointer.
data = (OUT / "r4-aes128-user.pdf").read_bytes()
(OUT / "damaged-r4-aes128-user.pdf").write_bytes(data[: data.rfind(b"startxref")] + b"startxref\n999999\n%%EOF\n")

# Unrecoverable: should all say "couldn't be read".
base = plain.read_bytes()
broken = OUT / "broken"
broken.mkdir()
for name, content in {
    "empty.pdf": b"",
    "header-only.pdf": b"%PDF-1.7\n",
    "truncated-100-bytes.pdf": base[:100],
    "random-bytes.pdf": random.Random(1).randbytes(8000),
    "png-renamed.pdf": (HERE.parent / "favicon-32x32.png").read_bytes(),
    "html-renamed.pdf": b"<!doctype html><title>Not a PDF</title><p>Saved web page with a .pdf name</p>",
    "zeroed-body.pdf": base[:20] + b"\0" * (len(base) - 40) + base[-20:],
    "no-pages.pdf": b"%PDF-1.4\n1 0 obj<</Type/Catalog>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n",
}.items():
    (broken / name).write_bytes(content)

# Imitation DRM and certificate encryption (real ones can't be generated): should say "DRM or certificate".
enc = (OUT / "r6-aes256-user.pdf").read_bytes()
assert b"/Filter /Standard" in enc
(broken / "drm-fileopen.pdf").write_bytes(enc.replace(b"/Filter /Standard", b"/Filter /FOPN#5Ffoweb", 1))
(broken / "cert-pubsec.pdf").write_bytes(enc.replace(b"/Filter /Standard", b"/Filter /Adobe.PubSec /SubFilter /adbe.pkcs7.s5", 1))

print(f"Wrote {len(list(OUT.rglob('*.pdf')))} fixtures to {OUT}")
