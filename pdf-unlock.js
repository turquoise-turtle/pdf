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
	
	
	var text = document.querySelector('#printmenu');
	// Firefox 1.0+
	var isFirefox = typeof InstallTrigger !== 'undefined';
	// Safari 3.0+ "[object HTMLElementConstructor]" 
	var isSafari = /constructor/i.test(window.HTMLElement) || (function (p) { return p.toString() === "[object SafariRemoteNotification]"; })(!window['safari'] || (typeof safari !== 'undefined' && safari.pushNotification));
	// Chrome 1+
	var isChrome = !!window.chrome && !!window.chrome.webstore;
	
	if (isFirefox || isSafari) {
		text.innerText = 'In the bottom left hand corner click PDF, and choose Save As PDF';
	} else {
		//isChrome
		text.innerText = 'From there, under Destination click Change, and choose Save As PDF';
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