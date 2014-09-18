'use strict';

/* global PitchDetector */

var pitchDetector = new PitchDetector();
var toneElement = window.document.createElement('p');
var statusElement = window.document.createElement('p');

statusElement.innerHTML = 'Current status: Not listening';

window.document.body.appendChild(toneElement);
window.document.body.appendChild(statusElement);

pitchDetector.on('pitchData', function (event) {
 // console.log(event.detail.pitch, event.detail.note, event.detail.detune);
  toneElement.innerHTML =
    'Current tone: <strong>' + (event.detail.note ? event.detail.note : 'N/A') + '</strong> ' +
    'Cents off: <strong>' + (event.detail.detune ? event.detail.detune : 'N/A') + '</strong>';
});

pitchDetector.on('error', function () {
  alert('Your browser does not support audio input, please try the newest version of Firefox.');
});

pitchDetector.on('startListening', function () {
  console.log('startListening');
  statusElement.innerHTML = 'Current status: Listening';
});

pitchDetector.on('stopListening', function () {
  console.log('stopListening');
  statusElement.innerHTML = 'Current status: Not listening';
});

pitchDetector.startListening();
