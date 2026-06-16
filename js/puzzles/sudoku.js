import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getAuth, signInWithPopup, GoogleAuthProvider, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { getFirestore, collection, query, where, limit, getDocs } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

// 1. Firebaseの設定（ご自身のものに差し替えてください）
const firebaseConfig = {
  apiKey: "AIzaSyCkbdX-B6FfIVplmG98tIvxO0uUv-mYDSw",
  authDomain: "yourlogic-c0b64.firebaseapp.com",
  projectId: "yourlogic-c0b64",
  storageBucket: "yourlogic-c0b64.firebasestorage.app",
  messagingSenderId: "774656497074",
  appId: "1:774656497074:web:07d6d6092d5d176224c0ab",
  measurementId: "G-W4VM6FC3J5"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const provider = new GoogleAuthProvider();

let currentUser = null;
let selectedCell = null;
let currentDifficulty = 'easy';

const statusText = document.getElementById('auth-status-text');
const loginBtn = document.getElementById('login-btn');
const logoutBtn = document.getElementById('logout-btn');

// ログイン状態の監視
onAuthStateChanged(auth, (user) => {
    currentUser = user;
    if (user) {
        statusText.innerText = `ログイン中: ${user.displayName}`;
        loginBtn.style.display = 'none';
        logoutBtn.style.display = 'block';
    } else {
        statusText.innerText = "ゲストモード（問題の自動生成はできません）";
        loginBtn.style.display = 'block';
        logoutBtn.style.display = 'none';
    }
});

loginBtn.addEventListener('click', () => signInWithPopup(auth, provider).catch(err => alert("ログイン失敗")));
logoutBtn.addEventListener('click', () => signOut(auth));

// 盤面の初期化 (9x9)
const boardElement = document.getElementById('board');
const cells = [];
for (let i = 0; i < 81; i++) {
    const cell = document.createElement('div');
    cell.classList.add('cell');
    cell.dataset.index = i;

    cell.addEventListener('click', () => {
        if (cell.classList.contains('initial')) return;
        if (selectedCell) selectedCell.classList.remove('selected');
        selectedCell = cell;
        cell.classList.add('selected');
    });
    boardElement.appendChild(cell);
    cells.push(cell);
}

// 難易度ボタンのイベント
document.querySelectorAll('.diff-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
        document.querySelectorAll('.diff-btn').forEach(b => b.classList.remove('active'));
        e.target.classList.add('active');
        currentDifficulty = e.target.dataset.diff;
        
        loadOrGeneratePuzzle();
    });
});

// ナンバーパッドの入力イベント
document.querySelectorAll('.num-pad button').forEach(btn => {
    btn.addEventListener('click', () => {
        if (!selectedCell) return;
        const num = btn.dataset.num;
        selectedCell.innerText = num;
        if (num === '') {
            selectedCell.classList.remove('user-filled');
        } else {
            selectedCell.classList.add('user-filled');
        }
    });
});

// Firestoreから問題をロードする中心関数
async function loadOrGeneratePuzzle() {
    console.log(`難易度「${currentDifficulty}」のパズルをFirestoreから探します...`);
    
    try {
        const q = query(
            collection(db, "puzzles"),
            where("type", "==", "sudoku"),
            where("difficulty", "==", currentDifficulty),
            limit(1)
        );
        
        const querySnapshot = await getDocs(q);
        
        if (!querySnapshot.empty) {
            const puzzleDoc = querySnapshot.docs[0].data();
            const boardStr = puzzleDoc.problemData;
            
            displayPuzzle(boardStr);
            console.log("Firestoreから問題を読み込みました！");
            
        } else {
            alert(`Firestoreに難易度「${currentDifficulty}」のストックがありません。`);
        }
    } catch (error) {
        console.error("データ取得エラー:", error);
        alert("データの読み込みに失敗しました。");
    }
}

// 盤面描画の補助関数
function displayPuzzle(boardStr) {
    if (selectedCell) {
        selectedCell.classList.remove('selected');
        selectedCell = null;
    }
    
    for (let i = 0; i < 81; i++) {
        const char = boardStr[i];
        cells[i].className = 'cell';
        
        if (char !== '0') {
            cells[i].innerText = char;
            cells[i].classList.add('initial');
        } else {
            cells[i].innerText = '';
        }
    }
}

document.getElementById('check-btn').addEventListener('click', () => alert("答え合わせ（今後実装）"));
document.getElementById('hint-btn').addEventListener('click', () => alert("ヒント（今後実装）"));

// 初回起動時に自動ロード
loadOrGeneratePuzzle();
