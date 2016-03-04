var audioContext = null;
var isPlaying = false;      // Are we currently playing?
var startTime;              // The start time of the entire sequence.
var current16thNote;        // What note is currently last scheduled?
var tempo = 120.0;          // tempo (in beats per minute)
var lookahead = 25.0;       // How frequently to call scheduling function 
                            //(in milliseconds)
var scheduleAheadTime = 0.1;    // How far ahead to schedule audio (sec)
                            // This is calculated from lookahead, and overlaps 
                            // with next interval (in case the timer is late)
var nextNoteTime = 0.0;     // when the next note is due.
var noteResolution = 0;     // 0 == 16th, 1 == 8th, 2 == quarter note
var noteLength = 0.10;      // length of "beep" (in seconds)
var canvas,                 // the canvas element
    canvasContext;          // canvasContext is the canvas' context 2D
var last16thNoteDrawn = -1; // the last "box" we drew on the screen
var notesInQueue = [];      // the notes that have been put into the web audio,
                            // and may or may not have played yet. {note, time}
var timerWorker = null;     // The Web Worker used to fire timer messages

var beatMarkers = [];
//var availableTones = [ 880.0, 440.0, 220.0 ];
//var availableTones = [ 261.626, 293.665, 329.628, 391.995, 440.000 ];
var availableTones = [ 523.251, 587.330, 659.255, 783.991, 880.000 ];
var toneStage = {
    top: null,
    left: null,
    width: null,
    height: null,
    tone: 0,
    linePosition: 0
};
var stateChanged = false;
var isMouseDown = false;

// First, let's shim the requestAnimationFrame API, with a setTimeout fallback
window.requestAnimFrame = (function(){
    return  window.requestAnimationFrame ||
    window.webkitRequestAnimationFrame ||
    window.mozRequestAnimationFrame ||
    window.oRequestAnimationFrame ||
    window.msRequestAnimationFrame ||
    function( callback ){
        window.setTimeout(callback, 1000 / 60);
    };
})();

function nextNote() {
    // Advance current note and time by a 16th note...
    var secondsPerBeat = 60.0 / tempo;    // Notice this picks up the CURRENT 
                                          // tempo value to calculate beat length.
    nextNoteTime += 0.25 * secondsPerBeat;    // Add beat length to last beat time

    current16thNote++;    // Advance the beat number, wrap to zero
    if (current16thNote == 16) {
        current16thNote = 0;
    }
}

function scheduleNote( beatNumber, time ) {
    // push the note on the queue, even if we're not playing.
    notesInQueue.push( { note: beatNumber, time: time } );

    if ( (noteResolution==1) && (beatNumber%2))
        return; // we're not playing non-8th 16th notes
    if ( (noteResolution==2) && (beatNumber%4))
        return; // we're not playing non-quarter 8th notes

    // create an oscillator
    var osc = audioContext.createOscillator();
    osc.connect( audioContext.destination );

    var marker = beatMarkers[beatNumber];
    if (!marker.active) return;


    osc.frequency.value = availableTones[toneStage.tone];

    osc.start( time );
    osc.stop( time + noteLength );
}

function scheduler() {
    // while there are notes that will need to play before the next interval, 
    // schedule them and advance the pointer.
    while (nextNoteTime < audioContext.currentTime + scheduleAheadTime ) {
        scheduleNote( current16thNote, nextNoteTime );
        nextNote();
    }
}

function play() {
    isPlaying = !isPlaying;

    if (isPlaying) { // start playing
        current16thNote = 0;
        nextNoteTime = audioContext.currentTime;
        timerWorker.postMessage("start");
        return "stop";
    } else {
        timerWorker.postMessage("stop");
        return "play";
    }
}

function resetCanvas (e) {
    // resize the canvas - but remember - this clears the canvas too.
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;

    //make sure we scroll to the top left.
    window.scrollTo(0,0); 
}

function draw() {
    var currentNote = last16thNoteDrawn;
    var currentTime = audioContext.currentTime;

    while (notesInQueue.length && notesInQueue[0].time < currentTime) {
        currentNote = notesInQueue[0].note;
        notesInQueue.splice(0,1);   // remove note from queue
    }

    // We only need to draw if the note has moved.
    if (last16thNoteDrawn != currentNote || stateChanged || isMouseDown) {
        var x = Math.floor( canvas.width / 18 );
        canvasContext.clearRect(0,0,canvas.width, canvas.height); 

        beatMarkers.forEach(function(box, i) {
            // Draw selector box

            canvasContext.fillStyle = box.active ? "blue" : "#ccc";
            canvasContext.fillRect( box.left, box.top, box.width, box.height );

            // Draw indicator box
            if (currentNote == i && isPlaying) {
                canvasContext.fillStyle = '#999';
                canvasContext.fillRect( box.left, box.top - box.height/3 - 5, box.width, box.height/3 );
            }
            
        });

        // Draw tone stage
        canvasContext.fillStyle = '#ccc';
        canvasContext.fillRect( toneStage.left, toneStage.top, toneStage.width, toneStage.height );
        canvasContext.fillStyle = '#ddd';
        var toneAreaHeight = Math.floor(toneStage.height / availableTones.length);
        for(var i=1;i<availableTones.length;i++) {
            canvasContext.fillRect( toneStage.left, toneStage.top + toneAreaHeight * i, toneStage.width, 1 );
        }

        // Draw tone line
        canvasContext.fillStyle = "blue";
        canvasContext.fillRect( toneStage.left, toneStage.linePosition, toneStage.width, 2 );

            //canvasContext.fillStyle = ( currentNote == i ) ? 
            //    ((currentNote%4 === 0)?"red":"blue") : "black";
            
        stateChanged = false;
        last16thNoteDrawn = currentNote;
    }

    // set up to draw again
    requestAnimFrame(draw);
}

function initBeatMarkers() {
    beatMarkers = []; // TODO: Consider keeping state

    var x = Math.floor( canvas.width / 18 );
    for (var i=0; i<16; i++) {
        beatMarkers.push({
            left: x * (i+1) + x/4,
            top: x,
            width: x/2,
            height: x/2,
            active: 0
        });
    }
}
function initToneStage() {
    var padding = Math.floor( canvas.width / 18 ) * 1.25;
    toneStage.left = padding;
    toneStage.width = canvas.width - 2*padding;
    toneStage.top = 1.5*padding;
    toneStage.height = 2*padding;

    toneStage.linePosition = 2*padding;
}

function getMousePos(canvas, evt) {
    var rect = canvas.getBoundingClientRect();
    return {
      x: evt.clientX - rect.left,
      y: evt.clientY - rect.top
    };
}

function isInToneStage(mousePos) {
    return mousePos.x >= toneStage.left && mousePos.x <= toneStage.left+toneStage.width && mousePos.y >= toneStage.top && mousePos.y <= toneStage.top + toneStage.height;
}

function init(){
    var container = document.createElement( 'div' );

    container.className = "container";
    canvas = document.createElement( 'canvas' );
    canvasContext = canvas.getContext( '2d' );
    canvas.width = window.innerWidth; 
    canvas.height = window.innerHeight; 
    document.body.appendChild( container );
    container.appendChild(canvas);    
    canvasContext.strokeStyle = "#ffffff";
    canvasContext.lineWidth = 2;

    initBeatMarkers();
    initToneStage();

    canvas.addEventListener('click', function(e) {
        //console.log("Canvas clicked", e);
        var x = event.offsetX,
            y = event.offsetY;

        // Determine clicked element
        beatMarkers.forEach(function(box, i) {
            if (y > box.top && y < box.top + box.height && x > box.left && x < box.left + box.width) {
                //box.tone = (box.tone+1)%availableTones.length;
                box.active = !box.active;
                stateChanged = true;         
            }
        });

    }, false);

    // Detect mouse move in stage
    
    canvas.addEventListener('mousedown', function(evt) {
        var mousePos = getMousePos(canvas, evt);
        if (isInToneStage(mousePos)) {
            console.log("Within bounding box");
            isMouseDown = true;
        }
      }, false);
    canvas.addEventListener('mouseup', function(evt) {
        isMouseDown = false;
    });

    canvas.addEventListener('mousemove', function(evt) {
        if (!isMouseDown) return;
        
        var mousePos = getMousePos(canvas, evt);
        if (!isInToneStage(mousePos)) return;
        
        toneStage.linePosition = mousePos.y;

        toneStage.tone = Math.min(Math.floor( (toneStage.linePosition-toneStage.top) / (toneStage.height / availableTones.length) ), availableTones.length - 1);
        //var message = 'Mouse position: ' + mousePos.x + ',' + mousePos.y;
        //console.log(message, toneStage.tone);
      }, false);

    // NOTE: THIS RELIES ON THE MONKEYPATCH LIBRARY BEING LOADED FROM
    // Http://cwilso.github.io/AudioContext-MonkeyPatch/AudioContextMonkeyPatch.js
    // TO WORK ON CURRENT CHROME!!  But this means our code can be properly
    // spec-compliant, and work on Chrome, Safari and Firefox.

    audioContext = new AudioContext();

    // if we wanted to load audio files, etc., this is where we should do it.

    window.onorientationchange = resetCanvas;
    window.onresize = resetCanvas;

    requestAnimFrame(draw);    // start the drawing loop.

    timerWorker = new Worker("js/metronomeworker.js");

    timerWorker.onmessage = function(e) {
        if (e.data == "tick") {
            // console.log("tick!");
            scheduler();
        }
        else
            console.log("message: " + e.data);
    };
    timerWorker.postMessage({"interval":lookahead});
}

window.addEventListener("load", init );

