//[NODE.JS] Importazione dei moduli nativi e di terze parti
const express = require('express');
const http = require('http');
const WebSocket = require('ws');    
const fs = require('fs');          
const path = require('path');       

//[EXPRESS] Configurazione dell'applicazione Express e dei Middleware
const app = express();
const PORTA = 3000;

//Middleware integrato di Express per servire automaticamente tutti i file statici
//(HTML, CSS, JS lato client) contenuti nella cartella 'public'
app.use(express.static(path.join(__dirname, 'public')));

//Middleware integrato di Express per interpretare il formato JSON nel body delle richieste HTTP
app.use(express.json());

//Middleware personalizzato: stampa nel terminale ogni richiesta HTTP ricevuta (utile per debug)
app.use((req, res, next) => {
    console.log(`[HTTP ${req.method}] Richiesta ricevuta su: ${req.url}`);
    next(); 
});

//[NODE.JS - FS] Gestione della persistenza dei dati su file JSON
const FILE_DATI = path.join(__dirname, 'bacheca.json');

//Funzione per leggere i post-it salvati su file all'avvio del server
function caricaBacheca() {
    try {
        if (fs.existsSync(FILE_DATI)) {
            const datiGrezzi = fs.readFileSync(FILE_DATI, 'utf8');
            return JSON.parse(datiGrezzi);
        }
    } catch (errore) {
        console.error('Errore durante la lettura di bacheca.json:', errore);
    }
    return []; 
}

//Funzione per salvare l'array dei post-it sul file JSON
function salvaBachecaSuFile() {
    fs.writeFile(FILE_DATI, JSON.stringify(bacheca, null, 2), (errore) => {
        if (errore) {
            console.error('Errore nel salvataggio su file:', errore);
        }
    });
}

//Array in memoria RAM che contiene tutti i post-it attuali
let bacheca = caricaBacheca();

//[EXPRESS] Rotte HTTP REST per funzionalità extra

//Rotta GET per esportare e scaricare tutti gli appunti in un file di testo (.txt)
app.get('/api/esporta', (req, res) => {
    let testoEsportato = "=== APPUNTI BACHECA CONDIVISA ===\n\n";
    bacheca.forEach((postIt, indice) => {
        testoEsportato += `${indice + 1}. [${postIt.colore.toUpperCase()}] ${postIt.autore}: ${postIt.testo}\n`;
    });

    //Imposta gli header HTTP per forzare il download del file nel browser
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="appunti_gruppo.txt"');
    res.send(testoEsportato);
});

//Rotta DELETE per svuotare completamente la bacheca (richiamabile da un pulsante admin)
app.delete('/api/svuota', (req, res) => {
    bacheca = [];
    salvaBachecaSuFile();
    
    //Avvisa anche tutti i client WebSocket connessi che la bacheca è stata svuotata
    inviaATutti({ tipo: 'AGGIORNA_TUTTO', dati: bacheca });
    
    res.json({ messaggio: 'Bacheca svuotata con successo!' });
});

//[NODE.JS HTTP + WEBSOCKET ws] Creazione del server unificato
//Creiamo un server HTTP nativo passando 'app' (Express), così che Express e WebSocket possano lavorare insieme sulla stessa porta (3000)
const server = http.createServer(app);

//Colleghiamo il server WebSocket ('ws') al server HTTP appena creato
const wss = new WebSocket.Server({ server });

//Funzione di utilità per inviare un messaggio JSON a TUTTI i client connessi (Broadcast)
function inviaATutti(oggettoMessaggio) {
    const messaggioStringa = JSON.stringify(oggettoMessaggio);
    
    //wss.clients è un Set che contiene tutti i client attualmente collegati
    wss.clients.forEach((client) => {
        //Controlliamo che la connessione con quel singolo client sia aperta (OPEN)
        if (client.readyState === WebSocket.OPEN) {
            client.send(messaggioStringa);
        }
    });
}

//Evento 'connection': si attiva ogni volta che un nuovo utente apre la pagina web
wss.on('connection', (ws) => {
    console.log('[WS] Nuovo utente connesso! Client totali:', wss.clients.size);

    //1. Appena un client si collega, gli inviamo subito lo stato attuale della bacheca
    ws.send(JSON.stringify({
        tipo: 'AGGIORNA_TUTTO',
        dati: bacheca
    }));

    //2. Evento 'message': si attiva quando questo client invia dati al server
    ws.on('message', (messaggioRicevuto) => {
        try {
            //Convertiamo la stringa JSON ricevuta in un oggetto JavaScript
            const azione = JSON.parse(messaggioRicevuto);

            if (azione.tipo === 'AGGIUNGI') {
                //Creiamo il nuovo oggetto post-it con un ID univoco basato sul timestamp
                const nuovoPostIt = {
                    id: Date.now(),
                    autore: azione.autore || 'Anonimo',
                    testo: azione.testo,
                    colore: azione.colore || 'giallo'
                };

                bacheca.push(nuovoPostIt); 
                salvaBachecaSuFile();   

                // Inviamo il nuovo post-it a tutti i client connessi
                inviaATutti({
                    tipo: 'NUOVO_POSTIT',
                    dati: nuovoPostIt
                });
            } 
            else if (azione.tipo === 'ELIMINA') {
                //Filtriamo l'array tenendo tutti i post-it tranne quello con l'ID da eliminare
                bacheca = bacheca.filter(item => item.id !== azione.id);
                salvaBachecaSuFile(); // Aggiorniamo il file JSON

                //Comunichiamo a tutti i client di rimuovere quel post-it dallo schermo
                inviaATutti({
                    tipo: 'RIMUOVI_POSTIT',
                    id: azione.id
                });
            }
            else if (azione.tipo === 'COMPLETA') {
                //Cerchiamo il post-it nell'array tramite il suo ID
                const postItTrovato = bacheca.find(item => item.id === azione.id);
                
                if (postItTrovato) {
                    //Cambiamo il colore in 'verde' e segniamo che è completato
                    postItTrovato.colore = 'verde';
                    postItTrovato.completato = true;
                    
                    salvaBachecaSuFile(); // Aggiorniamo il file JSON

                    //Avvisiamo tutti i client connessi che questo post-it è cambiato
                    inviaATutti({
                        tipo: 'AGGIORNA_POSTIT',
                        dati: postItTrovato
                    });
                }
            }
        } catch (err) {
            console.error('[WS] Errore nella lettura del messaggio JSON:', err);
        }
    });

    //3. Evento 'close': si attiva quando l'utente chiude la scheda del browser
    ws.on('close', () => {
        console.log('[WS] Un utente si è disconnesso. Client rimasti:', wss.clients.size);
    });
});

//Avvio del server in ascolto sulla porta configurata
server.listen(PORTA, () => {
    console.log(`Server avviato! Apri il browser su http://localhost:${PORTA}`);
});