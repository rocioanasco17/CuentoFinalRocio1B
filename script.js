pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.16.105/pdf.worker.min.js';

const bookContainer = document.getElementById('flip-book');
const bookWrapper = document.querySelector('.book-container');
const loading = document.getElementById('loading');
const pageCounter = document.getElementById('page-counter');

const btnPrev = document.getElementById('btn-prev');
const btnNext = document.getElementById('btn-next');
const btnTts = document.getElementById('btn-tts');
const btnZoomIn = document.getElementById('btn-zoom-in');
const btnZoomOut = document.getElementById('btn-zoom-out');

let pageFlip = null;
let currentZoom = 1;
let pageTexts = []; // Almacena el texto extraído del PDF para TTS
const synth = window.speechSynthesis;
let isSpeaking = false;

// 1. Efecto de sonido de hoja girando usando Web Audio API (Mágico y suave)
function playFlipSound() {
    try {
        const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        
        // Ruido blanco simulando el roce de papel
        const bufferSize = audioCtx.sampleRate * 0.3; // 300ms de duración
        const buffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) {
            data[i] = Math.random() * 2 - 1;
        }

        const noise = audioCtx.createBufferSource();
        noise.buffer = buffer;

        // Filtro para dar tono suave de hoja
        const filter = audioCtx.createBiquadFilter();
        filter.type = 'bandpass';
        filter.frequency.setValueAtTime(800, audioCtx.currentTime);
        filter.frequency.exponentialRampToValueAtTime(300, audioCtx.currentTime + 0.3);
        filter.Q.value = 1.2;

        // Control de volumen suave
        const gain = audioCtx.createGain();
        gain.gain.setValueAtTime(0.01, audioCtx.currentTime);
        gain.gain.linearRampToValueAtTime(0.15, audioCtx.currentTime + 0.05);
        gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.3);

        noise.connect(filter);
        filter.connect(gain);
        gain.connect(audioCtx.destination);

        noise.start();
        noise.stop(audioCtx.currentTime + 0.3);
    } catch (e) {
        console.log('Audio no interactuado aún.');
    }
}

// 2. Cargar automáticamente "cuento.pdf" alojado en el mismo repositorio
document.addEventListener('DOMContentLoaded', () => {
    fetch('cuento.pdf')
        .then(response => {
            if (!response.ok) {
                throw new Error('No se encontró el archivo cuento.pdf en el repositorio.');
            }
            return response.arrayBuffer();
        })
        .then(data => loadPDF(new Uint8Array(data)))
        .catch(error => {
            console.error(error);
            loading.innerText = '⚠️ No se pudo cargar el archivo "cuento.pdf". Asegúrate de que existe en el repositorio.';
        });
});

async function loadPDF(pdfData) {
    loading.style.display = 'block';
    bookContainer.style.display = 'none';
    bookContainer.innerHTML = '';
    pageTexts = [];

    if (pageFlip) {
        pageFlip.destroy();
        pageFlip = null;
    }

    try {
        const pdf = await pdfjsLib.getDocument(pdfData).promise;
        const totalPages = pdf.numPages;

        const firstPage = await pdf.getPage(1);
        const viewportInfo = firstPage.getViewport({ scale: 1.5 });
        const pageWidth = viewportInfo.width;
        const pageHeight = viewportInfo.height;

        for (let pageNum = 1; pageNum <= totalPages; pageNum++) {
            const page = await pdf.getPage(pageNum);
            
            // Extraer texto para lectura en voz alta (accesibilidad)
            const textContent = await page.getTextContent();
            const pageString = textContent.items.map(item => item.str).join(' ');
            pageTexts.push(pageString);

            // Renderizar la página en Canvas
            const viewport = page.getViewport({ scale: 1.5 });
            const canvas = document.createElement('canvas');
            const context = canvas.getContext('2d');
            canvas.height = viewport.height;
            canvas.width = viewport.width;

            await page.render({ canvasContext: context, viewport: viewport }).promise;

            const pageDiv = document.createElement('div');
            pageDiv.className = 'page';
            pageDiv.appendChild(canvas);
            bookContainer.appendChild(pageDiv);
        }

        bookContainer.style.display = 'block';

        // Inicialización de PageFlip
        pageFlip = new St.PageFlip(bookContainer, {
            width: pageWidth,
            height: pageHeight,
            size: "stretch",
            minWidth: 280,
            maxWidth: pageWidth,
            minHeight: 380,
            maxHeight: pageHeight,
            showCover: true,
            maxShadowOpacity: 0.4,
            usePortrait: true,
            flippingTime: 800
        });

        const pages = document.querySelectorAll('.page');
        pageFlip.loadFromHTML(pages);

        // Eventos de giro de página
        pageFlip.on('flip', (e) => {
            playFlipSound();
            updatePageCounter();
            if (isSpeaking) {
                stopTTS();
                speakCurrentPage();
            }
        });

        updatePageCounter();
        loading.style.display = 'none';

    } catch (error) {
        console.error('Error procesando el PDF:', error);
        loading.innerText = 'Error al procesar "cuento.pdf".';
    }
}

// 3. Botones de Navegación (Patitas de Gato)
btnPrev.addEventListener('click', () => {
    if (pageFlip) pageFlip.flipPrev();
});

btnNext.addEventListener('click', () => {
    if (pageFlip) pageFlip.flipNext();
});

function updatePageCounter() {
    if (!pageFlip) return;
    const current = pageFlip.getCurrentPageIndex() + 1;
    const total = pageFlip.getPageCount();
    pageCounter.innerText = `📖 Página ${current} de ${total}`;
}

// 4. Lectura en Voz Alta (TTS en Español para baja visión)
btnTts.addEventListener('click', () => {
    if (isSpeaking) {
        stopTTS();
    } else {
        speakCurrentPage();
    }
});

function speakCurrentPage() {
    if (!synth || pageTexts.length === 0) return;

    synth.cancel(); // Detener lecturas previas
    const currentPageIndex = pageFlip.getCurrentPageIndex();
    const textToRead = pageTexts[currentPageIndex];

    if (!textToRead || textToRead.trim() === '') {
        readText("Esta página no contiene texto para leer.");
        return;
    }

    readText(textToRead);
}

function readText(text) {
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'es-ES';
    utterance.rate = 0.9; // Velocidad pausada para niños/baja visión

    utterance.onstart = () => {
        isSpeaking = true;
        btnTts.classList.add('speaking');
        btnTts.querySelector('.btn-text').innerText = 'Detener Lectura';
    };

    utterance.onend = () => {
        stopTTS();
    };

    utterance.onerror = () => {
        stopTTS();
    };

    synth.speak(utterance);
}

function stopTTS() {
    if (synth) synth.cancel();
    isSpeaking = false;
    btnTts.classList.remove('speaking');
    btnTts.querySelector('.btn-text').innerText = 'Lectura en Voz Alta';
}

// 5. Botones para Agrandar o Achicar el Cuento (Zoom del libro)
btnZoomIn.addEventListener('click', () => {
    if (currentZoom < 1.4) {
        currentZoom += 0.1;
        applyZoom();
    }
});

btnZoomOut.addEventListener('click', () => {
    if (currentZoom > 0.7) {
        currentZoom -= 0.1;
        applyZoom();
    }
});

function applyZoom() {
    bookWrapper.style.transform = `scale(${currentZoom})`;
}