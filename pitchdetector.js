'use strict';

/*
The MIT License (MIT)

Copyright (c) 2014 Fredrik Söderström

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
*/

// TODO: fix bug that somehow closes the mic connection after some seconds:

function PitchDetector() {
	if (!window.requestAnimationFrame) {
		window.requestAnimationFrame = window.webkitRequestAnimationFrame;
  }

  this.audioContext = this.createAudioContext();
  this.pitchUpdaterId = null;
  this.bufferLength = 2048;
  this.buffer = new Uint8Array(this.bufferLength);
  this.eventBaseId = 'PitchDetector|' + Date.now() + '|';
}

PitchDetector.prototype.on = function (eventName, callback) {
  window.addEventListener(this.eventBaseId + eventName, callback);
};

PitchDetector.prototype.off = function (eventName, callback) {
  window.removeEventListener(this.eventBaseId + eventName, callback);
};

PitchDetector.prototype.trigger = function (eventName, data) {
  window.dispatchEvent(new CustomEvent(this.eventBaseId + eventName, { 'detail': data }));
};

PitchDetector.prototype.noteStrings = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

PitchDetector.prototype.displayAudioInputNotSupportedError = function (error) {
  console.error(error);
  this.trigger('error', error);
};

PitchDetector.prototype.createAudioContext = function () {
  var audioContext;

  try {
    audioContext = window.AudioContext ? new window.AudioContext() : new window.webkitAudioContext();
  } catch (exception) {
    this.displayAudioInputNotSupportedError(exception);
  }

  if (!audioContext) {
    this.displayAudioInputNotSupportedError();
  }

  return audioContext;
};

PitchDetector.prototype.getUserMedia = function (dictionary, callback) {
  var self = this;

  try {
    navigator.getUserMedia =
      navigator.getUserMedia ||
      navigator.webkitGetUserMedia ||
      navigator.mozGetUserMedia;

    navigator.getUserMedia(dictionary, callback, function (error) {
      self.displayAudioInputNotSupportedError(error);
    });
  } catch (error) {
    self.displayAudioInputNotSupportedError(error);
  }
};

PitchDetector.prototype.gotStream = function (stream) {
  // Create an AudioNode from the stream.
  this.mediaStreamSource = this.audioContext.createMediaStreamSource(stream);

  // Connect it to the destination.
  this.analyser = this.audioContext.createAnalyser();
  this.analyser.fftSize = this.bufferLength;
  this.mediaStreamSource.connect(this.analyser);
  this.updatePitch();
};

PitchDetector.prototype.updatePitch = function () {
  var self = this;

  this.analyser.getByteTimeDomainData(this.buffer);

	/*
   * possible approach to confidence: sort the array, take the median;
   * go through the array and compute the average deviation
   */
  this.pitch = this.autoCorrelate(this.buffer, this.audioContext.sampleRate);

  if (this.pitch === -1) {
    this.pitch = null;
    this.noteId = null;
    this.note = null;
    this.detune = null;
  } else {
    this.noteId = this.noteFromPitch(this.pitch);
    this.note = this.noteStrings[this.noteId % this.noteStrings.length];
    this.detune = this.centsOffFromPitch(this.pitch, this.noteId);
  }

  this.trigger('pitchData', {
    pitch: this.pitch,
    noteId: this.noteId,
    note: this.note,
    detune: this.detune
  });

  this.pitchUpdaterId = window.requestAnimationFrame(function () {
    self.updatePitch();
  });
};

PitchDetector.prototype.autoCorrelate = function (buffer, sampleRate) {
	var MIN_SAMPLES = 4;	// corresponds to an 11kHz signal
	var MAX_SAMPLES = 1000; // corresponds to a 44Hz signal
	var SIZE = 1000;
	var bestOffset = -1;
	var bestCorrelation = 0;
	var rms = 0;
	var foundGoodCorrelation = false;
  var i = 0;
  var val;
	var lastCorrelation = 1;
	var correlation = 0;
  var offset = 0;

  if (buffer.length < SIZE + MAX_SAMPLES - MIN_SAMPLES) {
		return -1;  // Not enough data
  }

	for (i = 0; i < SIZE ; i += 1) {
		val = (buffer[i] - 128) / 128;
		rms += val * val;
	}

	rms = Math.sqrt(rms / SIZE);
	if (rms < 0.01) {
		return -1;
  }

	for (offset = MIN_SAMPLES; offset <= MAX_SAMPLES; offset += 1) {
		correlation = 0;

		for (i = 0; i < SIZE; i += 1) {
			correlation += Math.abs(((buffer[i] - 128) / 128) - ((buffer[i + offset] - 128) / 128));
		}

    correlation = 1 - (correlation / SIZE);

    if (correlation > 0.9 && correlation > lastCorrelation) {
			foundGoodCorrelation = true;
    } else if (foundGoodCorrelation) {
			// short-circuit - we found a good correlation, then a bad one, so we'd just be seeing copies from here.
			return sampleRate / bestOffset;
		}

    lastCorrelation = correlation;

    if (correlation > bestCorrelation) {
			bestCorrelation = correlation;
			bestOffset = offset;
		}
	}

  if (bestCorrelation > 0.01) {
    return sampleRate / bestOffset;
  } else {
    return -1;
  }
};

PitchDetector.prototype.noteFromPitch = function (frequency) {
	var noteNum = 12 * (Math.log(frequency / 440) / Math.log(2));
	return Math.round(noteNum) + 69;
};

PitchDetector.prototype.frequencyFromNoteNumber = function (note) {
	return 440 * Math.pow(2, (note - 69) / 12);
};

PitchDetector.prototype.centsOffFromPitch = function (frequency, note) {
	return Math.floor(1200 * Math.log(frequency / this.frequencyFromNoteNumber(note)) / Math.log(2));
};

PitchDetector.prototype.stopListening = function () {
  if (!window.cancelAnimationFrame) {
    window.cancelAnimationFrame = window.webkitCancelAnimationFrame;
  }
  window.cancelAnimationFrame(this.pitchUpdaterId);
  delete this.mediaStreamSource;
  this.trigger('stopListening');
};

PitchDetector.prototype.startListening = function () {
  var self = this;

  this.stopListening();
  this.getUserMedia({ audio: true }, function (stream) {
    self.gotStream(stream);
    self.trigger('startListening');
  });
};
