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
}, false);

document.addEventListener('pagesloaded', function (e) {
	window.print();
}, true);

function handleFiles(files) {
	document.querySelector('#outerContainer').hidden = false;
	document.querySelector('#pdf-unlock-box').hidden = true;
	var fileblob = files[0];
	PDFViewerApplication.open(URL.createObjectURL(fileblob));
}


function dragenter(e) {
	e.stopPropagation();
	e.preventDefault();
}

function dragover(e) {
	e.stopPropagation();
	e.preventDefault();
	dropbox.classList.add('animated');
}

function dragleave(e) {
	e.stopPropagation();
	e.preventDefault();
	dropbox.classList.remove('animated');
}

function drop(e) {
	e.stopPropagation();
	e.preventDefault();
	dropbox.classList.remove('animated');

	var dt = e.dataTransfer;
	var files = dt.files;
	handleFiles(files);
}