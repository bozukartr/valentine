import { db } from './firebase-config.js';
import { generateAllDistractors } from './gemini-api.js';
import { ref, set, onValue, update, get } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js";

// Question Pool (40 Questions)
const QUESTION_POOL = [
    "En sevdiğim renk nedir?", "En sevdiğim yemek hangisi?", "En büyük korkum nedir?", "Hayalimdeki tatil neresi?",
    "En sevdiğim film türü hangisi?", "En sevdiğim mevsim hangisi?", "Çocukluk kahramanım kimdi?", "Hangi hayvanı beslemek isterdim?",
    "Sabah insanı mıyım yoksa gece kuşu mu?", "En sevdiğim tatlı nedir?", "Hangi süper güce sahip olmak isterdim?",
    "En çok gitmek istediğim ülke neresi?", "En sevdiğim müzik grubu veya sanatçı kim?", "Hobilerimden hangisine daha çok vakit ayırırım?",
    "En nefret ettiğim ev işi hangisidir?", "En sevdiğim meyve hangisi?", "Hangi dilde akıcı konuşmak isterdim?",
    "En sevdiğim kitap hangisi?", "Dışarı çıkmak mı, evde kalmak mı?", "En sevdiğim koku nedir?",
    "En büyük takıntım nedir?", "En sevdiğim oyun hangisi?", "Hayatımdaki en büyük başarı nedir?",
    "En sevdiğim çiçek hangisi?", "Hangi sporu yapmayı severim?", "En sevdiğim kıyafetim hangisi?",
    "İdolüm kimdir?", "En sevdiğim içecek nedir?", "Başkalarında en çok takdir ettiğim özellik nedir?",
    "Dünya turuna çıksam ilk durağım neresi olurdu?", "En sevdiğim dizi hangisi?", "Hangi ünlüyle tanışmak isterdim?",
    "Hayat felsefem nedir?", "En sevdiğim aksesuarım hangisi?", "En sevdiğim dondurma aroması nedir?",
    "Hangi tarihsel dönemde yaşamak isterdim?", "En büyük pişmanlığım nedir?", "En sevdiğim uygulama hangisi?",
    "Hangi teknolojik aleti olmadan yaşayamazdım?", "En sevdiğim çocukluk oyuncağım neydi?"
];

// App State
let roomId = null;
let playerRole = null;
let selectedQuestionIndices = [];
let currentQuestionIndex = 0;
let score = 0;
let roomData = null;
let tempAnswers = [];

// View Navigation
function showView(viewId) {
    document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
    document.getElementById(viewId).classList.add('active');
}

// Custom Toast
const Toast = Swal.mixin({
    toast: true,
    position: 'top',
    showConfirmButton: false,
    timer: 3000,
    timerProgressBar: true
});

// Initial Events
document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('btn-create-room').addEventListener('click', createRoom);
    document.getElementById('btn-join-room').addEventListener('click', joinRoomPrompt);
    document.getElementById('btn-start-game').addEventListener('click', startGame);
    document.getElementById('btn-next-question').addEventListener('click', handleNextQuestion);
    document.getElementById('btn-restart').addEventListener('click', () => location.reload());

    // Back button logic with i18n support
    document.querySelectorAll('.btn-back').forEach(btn => {
        btn.addEventListener('click', () => {
            Swal.fire({
                title: 'Odadan çıkmak istiyor musun?',
                text: "İlerlemen kaybolacak.",
                icon: 'warning',
                showCancelButton: true,
                confirmButtonText: 'Evet, çık',
                cancelButtonText: 'İptal',
                confirmButtonColor: '#ff2d55',
                cancelButtonColor: '#007aff'
            }).then((result) => {
                if (result.isConfirmed) location.reload();
            });
        });
    });
});

async function createRoom() {
    roomId = Math.random().toString(36).substring(2, 6).toUpperCase();
    playerRole = 'player1';

    const shuffled = [...QUESTION_POOL.keys()].sort(() => 0.5 - Math.random());
    selectedQuestionIndices = shuffled.slice(0, 5);

    await set(ref(db, `rooms/${roomId}`), {
        status: 'waiting',
        questions: selectedQuestionIndices,
        player1: { active: true, answers: {} },
        player2: { active: false, answers: {} }
    });

    listenToRoom();
    showView('screen-room');
    document.getElementById('display-room-code').innerText = roomId;
    Toast.fire({ icon: 'success', title: 'Oda oluşturuldu!' });
}

async function joinRoomPrompt() {
    const { value: code } = await Swal.fire({
        title: 'Oda Kodunu Girin',
        input: 'text',
        inputPlaceholder: 'Örn: A1B2',
        showCancelButton: true,
        inputValidator: (value) => {
            if (!value) return 'Bir kod girmelisin!';
        }
    });

    if (code) joinRoom(code.toUpperCase());
}

async function joinRoom(code) {
    try {
        const snapshot = await get(ref(db, `rooms/${code}`));
        if (snapshot.exists()) {
            roomId = code;
            playerRole = 'player2';
            await update(ref(db, `rooms/${roomId}/player2`), { active: true });
            listenToRoom();
            showView('screen-room');
            document.getElementById('display-room-code').innerText = roomId;
            Toast.fire({ icon: 'success', title: 'Odaya katıldın!' });
        } else {
            Swal.fire('Hata!', 'Oda bulunamadı.', 'error');
        }
    } catch (e) {
        Swal.fire('Hata!', 'Bağlantı sorunu oluştu.', 'error');
    }
}

function listenToRoom() {
    onValue(ref(db, `rooms/${roomId}`), async (snapshot) => {
        roomData = snapshot.val();
        if (!roomData) return;

        updateLobbyUI();

        if (roomData.status === 'answering' && document.getElementById('screen-room').classList.contains('active')) {
            startAnsweringPhase();
        }

        if (roomData.status === 'guessing' && (document.getElementById('screen-questions').classList.contains('active') || document.getElementById('screen-waiting').classList.contains('active'))) {
            startGuessingPhase();
        }

        if (roomData.status === 'results' && !document.getElementById('screen-results').classList.contains('active')) {
            showFinalResults();
        }
    });
}

function updateLobbyUI() {
    const p1Slot = document.getElementById('player-1');
    const p2Slot = document.getElementById('player-2');
    const startBtn = document.getElementById('btn-start-game');

    if (roomData.player1?.active) {
        p1Slot.innerHTML = `<i class="fas fa-check-circle" style="color:var(--ios-blue)"></i> <span>1. Oyuncu Hazır</span>`;
        p1Slot.classList.remove('empty');
    }
    if (roomData.player2?.active) {
        p2Slot.innerHTML = `<i class="fas fa-check-circle" style="color:var(--ios-blue)"></i> <span>2. Oyuncu Hazır</span>`;
        p2Slot.classList.remove('empty');
    }

    if (playerRole === 'player1' && roomData.player2?.active) {
        startBtn.classList.remove('disabled');
        startBtn.disabled = false;
    }
}

async function startGame() {
    await update(ref(db, `rooms/${roomId}`), { status: 'answering' });
}

function startAnsweringPhase() {
    showView('screen-questions');
    selectedQuestionIndices = roomData.questions;
    updateQuestionUI();
}

function updateQuestionUI() {
    const qText = QUESTION_POOL[selectedQuestionIndices[currentQuestionIndex]];
    document.getElementById('current-question-text').innerText = qText;
    document.getElementById('answer-input').value = "";
    document.getElementById('question-counter').innerText = `${currentQuestionIndex + 1}/5`;
    const progress = (currentQuestionIndex / 5) * 100;
    document.querySelector('.progress-fill').style.width = `${progress}%`;
}

async function handleNextQuestion() {
    const answer = document.getElementById('answer-input').value.trim();
    if (!answer) {
        Toast.fire({ icon: 'warning', title: 'Lütfen bir cevap yazın.' });
        return;
    }

    tempAnswers.push(answer);
    currentQuestionIndex++;

    if (currentQuestionIndex < 5) {
        updateQuestionUI();
    } else {
        await finalizeSelfAnswers();
    }
}

async function finalizeSelfAnswers() {
    showView('screen-waiting');
    document.getElementById('waiting-status').innerText = "Yapay zeka şıkları hazırlıyor...";

    const batchData = tempAnswers.map((ans, i) => ({
        question: QUESTION_POOL[selectedQuestionIndices[i]],
        answer: ans
    }));

    try {
        const allDistractors = await generateAllDistractors(batchData);

        const updates = {};
        tempAnswers.forEach((ans, i) => {
            const distractors = (allDistractors[i] || ["ALT 1", "ALT 2"]).map(s => s.toUpperCase());
            const realUp = ans.toUpperCase();
            updates[`rooms/${roomId}/${playerRole}/answers/${i}`] = {
                real: realUp,
                options: shuffle([realUp, ...distractors])
            };
        });
        await update(ref(db), updates);
        checkIfAllAnswered();
    } catch (e) {
        console.error("Finalize Error:", e);
        Swal.fire('Hata!', 'Şıklar oluşturulurken bir sorun çıktı.', 'error');
    }
}

async function checkIfAllAnswered() {
    const snapshot = await get(ref(db, `rooms/${roomId}`));
    const data = snapshot.val();
    const p1Done = Object.keys(data.player1.answers || {}).length === 5;
    const p2Done = Object.keys(data.player2.answers || {}).length === 5;

    if (p1Done && p2Done) {
        await update(ref(db, `rooms/${roomId}`), { status: 'guessing' });
    } else {
        document.getElementById('waiting-status').innerText = "Sevgilin soruları cevaplıyor...";
    }
}

function startGuessingPhase() {
    currentQuestionIndex = 0;
    showView('screen-guessing');
    renderGuessQuestion();
}

function renderGuessQuestion() {
    const partnerRole = playerRole === 'player1' ? 'player2' : 'player1';
    const qData = roomData[partnerRole].answers[currentQuestionIndex];
    if (!qData) return;

    const qText = QUESTION_POOL[roomData.questions[currentQuestionIndex]];

    document.getElementById('guess-question-text').innerText = `${qText}`;

    const container = document.getElementById('options-container');
    container.innerHTML = "";

    qData.options.forEach((opt, i) => {
        const btn = document.createElement('button');
        btn.className = "option-btn";
        btn.innerHTML = `<span>${String.fromCharCode(65 + i)}</span> ${opt}`;
        btn.onclick = () => submitGuess(opt, qData.real);
        container.appendChild(btn);
    });
}

function submitGuess(chosen, real) {
    if (chosen === real) score++;

    currentQuestionIndex++;
    if (currentQuestionIndex < 5) {
        renderGuessQuestion();
    } else {
        finishGuessingPhase();
    }
}

async function finishGuessingPhase() {
    showView('screen-waiting');
    document.getElementById('waiting-status').innerText = "Sevgilinin tahminlerini bitirmesi bekleniyor...";

    await update(ref(db, `rooms/${roomId}/${playerRole}`), { finalScore: score });

    const checkResults = () => {
        onValue(ref(db, `rooms/${roomId}`), (snap) => {
            const data = snap.val();
            if (data && data.player1.finalScore !== undefined && data.player2.finalScore !== undefined) {
                update(ref(db, `rooms/${roomId}`), { status: 'results' });
            }
        });
    };
    checkResults();
}

function showFinalResults() {
    showView('screen-results');
    const myScore = playerRole === 'player1' ? roomData.player1.finalScore : roomData.player2.finalScore;
    const partnerScore = playerRole === 'player1' ? roomData.player2.finalScore : roomData.player1.finalScore;

    document.getElementById('my-final-score').innerText = `${myScore}/5`;
    document.getElementById('partner-final-score').innerText = `${partnerScore}/5`;

    const totalCompatibility = ((myScore + partnerScore) / 10) * 100;
    const fill = document.getElementById('compatibility-fill');
    const text = document.getElementById('compatibility-text');

    setTimeout(() => {
        fill.style.width = `${totalCompatibility}%`;
        if (totalCompatibility >= 80) text.innerText = "Mükemmel Uyum! ❤️";
        else if (totalCompatibility >= 50) text.innerText = "Gayet İyisiniz! ✨";
        else text.innerText = "Biraz Daha Çalışmalısınız! 😅";
    }, 500);
}

function shuffle(array) {
    return array.sort(() => Math.random() - 0.5);
}
