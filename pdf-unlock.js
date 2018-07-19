// turquoise-turtle section below. GPLv3
document.addEventListener('DOMContentLoaded', function(e){
	document.querySelector('#outerContainer').hidden = true;
	
	document.querySelector('#fileElem').addEventListener('change', function() {
		handleFiles(this.files);
	}, false);
	var dropbox = document.querySelector('.container');
	dropbox.addEventListener("dragenter", dragenter, false);
	dropbox.addEventListener("dragover", dragover, false);
	dropbox.addEventListener("drop", drop, false);
	dropbox.addEventListener("dragleave", dragleave, false);
	
	
	// Firefox 1.0+
	var isFirefox = typeof InstallTrigger !== 'undefined';
	// Safari 3.0+ "[object HTMLElementConstructor]" 
	var isSafari = /constructor/i.test(window.HTMLElement) || (function (p) { return p.toString() === "[object SafariRemoteNotification]"; })(!window['safari'] || (typeof safari !== 'undefined' && safari.pushNotification));
	// Chrome 1+
	var isChrome = !!window.chrome && !!window.chrome.webstore;
	var text = document.querySelector('#printtext');
	var s1 = document.querySelector('#screenshot1');
	var s2 = document.querySelector('#screenshot2');
	var s3 = document.querySelector('#screenshot3');
	
	if (isFirefox) {
		text.innerText = 'In the bottom left hand corner click PDF, and choose Save As PDF';
		s1.src = 'screenshots/f1.png';
		s2.src = 'screenshots/f2.png';
		s3.parentNode.removeChild(s3);
	} else if (isSafari) {
		text.innerText = 'In the bottom left hand corner click PDF, and choose Save As PDF';
		s1.src = 'screenshots/s1.png';
		s2.src = 'screenshots/s2.png';
		s3.parentNode.removeChild(s3);
	} else {
		//isChrome, so don't change stuff
		//text.innerText = 'From there, under Destination click Change, and choose Save As PDF';
	}
}, false);

document.addEventListener('pagesloaded', function (e) {
	window.print();
}, true);

function handleFiles(files) {
	document.querySelector('#outerContainer').hidden = false;
	var fileblob = files[0];
	PDFViewerApplication.open(URL.createObjectURL(fileblob));
	var box = document.querySelector('#pdf-unlock-box'); //.hidden = true;
	box.parentNode.removeChild(box);
}


function dragenter(e) {
	e.stopPropagation();
	e.preventDefault();
}

function dragover(e) {
	var dropbox = document.querySelector('.container');
	e.stopPropagation();
	e.preventDefault();
	dropbox.classList.add('animated');
}

function dragleave(e) {
	var dropbox = document.querySelector('.container');
	e.stopPropagation();
	e.preventDefault();
	dropbox.classList.remove('animated');
}

function drop(e) {
	var dropbox = document.querySelector('.container');
	e.stopPropagation();
	e.preventDefault();
	dropbox.classList.remove('animated');

	var dt = e.dataTransfer;
	var files = dt.files;
	handleFiles(files);
}