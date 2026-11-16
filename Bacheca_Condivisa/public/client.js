// ============================================================================
// [CLIENT WEBSOCKET] Inizializzazione della connessione verso il server
// ============================================================================
// window.location.host prende automaticamente l'indirizzo e la porta (es. localhost:3000)
const socket = new WebSocket(`ws://${window.location.host}`);

// Riferimenti agli elementi HTML della pagina (DOM)
const statoDiv = document.getElementById('stato-connessione');
const lavagnaDiv = document.getElementById('lavagna');
const inputAutore = document.getElementById('input-autore');
const inputTesto = document.getElementById('input-testo');
const selectColore = document.getElementById('select-colore');
const btnAggiungi = document.getElementById('btn-aggiungi');
const btnSvuota = document.getElementById('btn-svuota');

// ============================================================================
// [WEBSOCKET EVENTI] Gestione apertura, messaggi in arrivo e chiusura
// ============================================================================

// Evento 'open': si attiva quando la connessione WebSocket con il server è stabilita
socket.addEventListener('open', () => {
    statoDiv.textContent = 'Connesso in tempo reale';
    statoDiv.className = 'connesso';
});

// Evento 'close': si attiva se il server viene spento o cade la connessione
socket.addEventListener('close', () => {
    statoDiv.textContent = 'Disconnesso dal server';
    statoDiv.className = 'disconnesso';
});

// Evento 'message': si attiva ogni volta che il server invia un dato in push
socket.addEventListener('message', (evento) => {
    // Trasformiamo la stringa JSON ricevuta dal server in un oggetto JS
    const messaggio = JSON.parse(evento.data);

    if (messaggio.tipo === 'AGGIORNA_TUTTO') {
        // Svuota la lavagna HTML e ridisegna tutti i post-it ricevuti dal server
        lavagnaDiv.innerHTML = '';
        messaggio.dati.forEach(postIt => creaElementoPostIt(postIt));
    } 
    else if (messaggio.tipo === 'NUOVO_POSTIT') {
        // Aggiunge solo il singolo nuovo post-it ricevuto in tempo reale
        creaElementoPostIt(messaggio.dati);
    } 
    else if (messaggio.tipo === 'RIMUOVI_POSTIT') {
        // Cerca il div con l'ID corrispondente e lo rimuove dalla pagina
        const elementoDaRimuovere = document.getElementById(`postit-${messaggio.id}`);
        if (elementoDaRimuovere) {
            elementoDaRimuovere.remove();
        }
    }
});

// ============================================================================
// [DOM & INVIO DATI] Funzioni per creare i post-it e inviare messaggi JSON
// ============================================================================

// Funzione che costruisce l'HTML di un singolo post-it e lo inserisce nella lavagna
function creaElementoPostIt(postIt) {
    const card = document.createElement('div');
    card.className = `post-it ${postIt.colore}`;
    card.id = `postit-${postIt.id}`; // Assegniamo l'ID per poterlo cancellare facilmente

    // Creiamo l'intestazione con nome autore e pulsante X per eliminare
    const header = document.createElement('div');
    header.className = 'post-it-header';
    
    const spanAutore = document.createElement('span');
    spanAutore.textContent = postIt.autore;

    const btnElimina = document.createElement('button');
    btnElimina.className = 'btn-elimina';
    btnElimina.textContent = '×';
    btnElimina.title = 'Elimina per tutti';
    
    // Quando si clicca la '×', invia al server la richiesta di eliminazione via WebSocket
    btnElimina.addEventListener('click', () => {
        socket.send(JSON.stringify({
            tipo: 'ELIMINA',
            id: postIt.id
        }));
    });

    header.appendChild(spanAutore);
    header.appendChild(btnElimina);

    // Creiamo il corpo del testo (usando textContent per evitare injection HTML/XSS)
    const corpo = document.createElement('div');
    corpo.className = 'post-it-testo';
    corpo.textContent = postIt.testo;

    card.appendChild(header);
    card.appendChild(corpo);
    lavagnaDiv.appendChild(card);
}

// Funzione per inviare un nuovo post-it al server
function inviaNuovoPostIt() {
    const testo = inputTesto.value.trim();
    const autore = inputAutore.value.trim() || 'Anonimo';
    const colore = selectColore.value;

    // Evitiamo di inviare post-it vuoti
    if (testo === '') {
        alert('Scrivi qualcosa prima di aggiungere il post-it!');
        return;
    }

    // Inviamo l'oggetto convertito in stringa JSON tramite WebSocket
    socket.send(JSON.stringify({
        tipo: 'AGGIUNGI',
        autore: autore,
        testo: testo,
        colore: colore
    }));

    // Puliamo il campo di testo dopo l'invio
    inputTesto.value = '';
    inputTesto.focus();
}

// Click sul pulsante "Aggiungi Post-it"
btnAggiungi.addEventListener('click', inviaNuovoPostIt);

// Permette di inviare anche premendo il tasto INVIO dentro la casella di testo
inputTesto.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
        inviaNuovoPostIt();
    }
});

// ============================================================================
// [FETCH API -> EXPRESS] Chiamata HTTP DELETE alla rotta /api/svuota
// ============================================================================
btnSvuota.addEventListener('click', () => {
    if (confirm('Vuoi davvero cancellare tutti i post-it per tutti gli utenti?')) {
        fetch('/api/svuota', { method: 'DELETE' })
            .then(risposta => risposta.json())
            .then(dati => console.log(dati.messaggio))
            .catch(err => console.error('Errore:', err));
    }
});