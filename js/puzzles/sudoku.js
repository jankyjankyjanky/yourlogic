import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getAuth, signInWithPopup, GoogleAuthProvider, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { getFirestore, collection, query, where, limit, getDocs } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

// 1. Firebaseの設定
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
let isMemoMode = false;

// 🔥 【新規】モード管理用変数
let currentInputMode = 'location'; // 'location' または 'auto'
let selectedNumber = null;         // オートプレイス用

const statusText = document.getElementById('auth-status-text');
const loginBtn = document.getElementById('login-btn');
const logoutBtn = document.getElementById('logout-btn');
const memoBtn = document.getElementById('memo-btn');
const modeLocationBtn = document.getElementById('mode-location-btn');
const modeAutoBtn = document.getElementById('mode-auto-btn');

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

    const cellVal = document.createElement('span');
    cellVal.classList.add('cell-val');
    cell.appendChild(cellVal);

    const memoGrid = document.createElement('div');
    memoGrid.classList.add('memo-grid');
    for (let m = 1; m <= 9; m++) {
        const span = document.createElement('span');
        span.dataset.num = m;
        memoGrid.appendChild(span);
    }
    cell.appendChild(memoGrid);

    // 💡 マスクリック時の挙動（選択モードで分岐）
    cell.addEventListener('click', () => {
        if (currentInputMode === 'auto') {
            if (cell.classList.contains('initial')) return;
            if (selectedNumber !== null) {
                selectedCell = cell;
                handleInput(selectedNumber);
            } else {
                updateHighlight(i);
            }
        } else {
            updateHighlight(i);
        }
    });
    boardElement.appendChild(cell);
    cells.push(cell);
}

// スマートハイライト制御関数
function updateHighlight(selectedIndex) {
    cells.forEach(cell => {
        cell.classList.remove('highlight-selected', 'highlight-area', 'highlight-same');
    });

    if (selectedIndex === null || selectedIndex === undefined) {
        selectedCell = null;
        return;
    }

    selectedCell = cells[selectedIndex];
    selectedCell.classList.add('highlight-selected');

    const r = Math.floor(selectedIndex / 9);
    const c = selectedIndex % 9;
    const b = Math.floor(r / 3) * 3 + Math.floor(c / 3);
    const targetNum = selectedCell.querySelector('.cell-val').innerText.trim();

    cells.forEach((cell, i) => {
        const cellRow = Math.floor(i / 9);
        const cellCol = i % 9;
        const cellBlock = Math.floor(cellRow / 3) * 3 + Math.floor(cellCol / 3);

        if (i !== selectedIndex && (cellRow === r || cellCol === c || cellBlock === b)) {
            cell.classList.add('highlight-area');
        }

        if (targetNum !== '') {
            const currentNum = cell.querySelector('.cell-val').innerText.trim();
            if (currentNum === targetNum && i !== selectedIndex) {
                cell.classList.add('highlight-same');
            }
        }
    });
}

// 入力コアロジック
function handleInput(num) {
    if (!selectedCell) return;
    if (selectedCell.classList.contains('initial')) return;

    const cellVal = selectedCell.querySelector('.cell-val');
    const memoGrid = selectedCell.querySelector('.memo-grid');

    if (num === '') {
        cellVal.innerText = '';
        selectedCell.classList.remove('user-filled');
        memoGrid.querySelectorAll('span').forEach(span => span.innerText = '');
    } else {
        if (isMemoMode) {
            cellVal.innerText = '';
            selectedCell.classList.remove('user-filled');

            const memoSpan = memoGrid.querySelector(`span[data-num="${num}"]`);
            if (memoSpan) {
                memoSpan.innerText = memoSpan.innerText === num ? '' : num;
            }
        } else {
            // 【通常入力モード】本設置
            cellVal.innerText = num;
            selectedCell.classList.add('user-filled');
            memoGrid.querySelectorAll('span').forEach(span => span.innerText = '');

            // 🔥 【新規】縦・横・同ブロックの同じ仮置き数字を自動消去
            const selectedIndex = parseInt(selectedCell.dataset.index);
            const r = Math.floor(selectedIndex / 9);
            const c = selectedIndex % 9;
            const b = Math.floor(r / 3) * 3 + Math.floor(c / 3);

            cells.forEach((cell, i) => {
                if (i === selectedIndex) return;
                const cellRow = Math.floor(i / 9);
                const cellCol = i % 9;
                const cellBlock = Math.floor(cellRow / 3) * 3 + Math.floor(cellCol / 3);

                if (cellRow === r || cellCol === c || cellBlock === b) {
                    const targetMemoSpan = cell.querySelector(`.memo-grid span[data-num="${num}"]`);
                    if (targetMemoSpan) targetMemoSpan.innerText = '';
                }
            });
        }
    }
    
    const index = parseInt(selectedCell.dataset.index);
    updateHighlight(index);
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

// 🔥 【新規】設置モード切り替えイベント
if (modeLocationBtn && modeAutoBtn) {
    modeLocationBtn.addEventListener('click', () => {
        currentInputMode = 'location';
        modeLocationBtn.classList.add('active');
        modeAutoBtn.classList.remove('active');
        selectedNumber = null;
        document.querySelectorAll('.num-pad .num-btn').forEach(b => b.classList.remove('selected-num'));
    });

    modeAutoBtn.addEventListener('click', () => {
        currentInputMode = 'auto';
        modeAutoBtn.classList.add('active');
        modeLocationBtn.classList.remove('active');
    });
}

// ナンバーパッドのクリックイベント
document.querySelectorAll('.num-pad .num-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        const num = btn.dataset.num;
        
        // 🔥 【新規】オートプレイス時は数字を選択状態にする
        if (currentInputMode === 'auto') {
            document.querySelectorAll('.num-pad .num-btn').forEach(b => b.classList.remove('selected-num'));
            if (selectedNumber === num) {
                selectedNumber = null;
            } else {
                selectedNumber = num;
                btn.classList.add('selected-num');
            }
        } else {
            handleInput(num);
        }
    });
});

// キーボード入力イベント
document.addEventListener('keydown', (e) => {
    // 🔥 【新規】Spaceキーまたは 'm' / 'M' キーで仮置きトグルを可能に
    if (e.key === ' ' || e.key.toLowerCase() === 'm') {
        e.preventDefault(); // スペースキーによる画面スクロールを防止
        if (memoBtn) memoBtn.click();
        return;
    }

    if (!selectedCell) return;
    
    if (e.key >= '1' && e.key <= '9') {
        if (currentInputMode === 'auto') {
            // オートプレイス時はキー入力で選択数字を切り替え可能に
            selectedNumber = e.key;
            document.querySelectorAll('.num-pad .num-btn').forEach(b => b.classList.remove('selected-num'));
            const targetBtn = document.querySelector(`.num-pad .num-btn[data-num="${e.key}"]`);
            if (targetBtn) targetBtn.classList.add('selected-num');
        } else {
            handleInput(e.key);
        }
    } else if (e.key === 'Backspace' || e.key === 'Delete' || e.key === '0') {
        if (currentInputMode === 'auto') {
            selectedNumber = '';
            document.querySelectorAll('.num-pad .num-btn').forEach(b => b.classList.remove('selected-num'));
            const targetBtn = document.querySelector('.num-pad .clear-btn');
            if (targetBtn) targetBtn.classList.add('selected-num');
        } else {
            handleInput('');
        }
    } else if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) {
        e.preventDefault();
        let index = parseInt(selectedCell.dataset.index);
        if (e.key === 'ArrowUp') index -= 9;
        if (e.key === 'ArrowDown') index += 9;
        if (e.key === 'ArrowLeft') index -= 1;
        if (e.key === 'ArrowRight') index += 1;

        if (index >= 0 && index < 81) {
            cells[index].click();
        }
    }
});

// 仮置きモード切替ボタンのイベント
if (memoBtn) {
    memoBtn.addEventListener('click', () => {
        isMemoMode = !isMemoMode;
        if (isMemoMode) {
            memoBtn.classList.add('active');
            memoBtn.innerText = "仮置きモード: ON";
        } else {
            memoBtn.classList.remove('active');
            memoBtn.innerText = "仮置きモード: OFF";
        }
    });
}

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
        alert("エラー内容: " + error.message); 
    }
}

// 盤面描画の補助関数
function displayPuzzle(boardStr) {
    updateHighlight(null);
    for (let i = 0; i < 81; i++) {
        const char = boardStr[i];
        cells[i].className = 'cell';
        const cellVal = cells[i].querySelector('.cell-val');
        const memoGrid = cells[i].querySelector('.memo-grid');
        memoGrid.querySelectorAll('span').forEach(span => span.innerText = '');
        
        if (char !== '0') {
            cellVal.innerText = char;
            cells[i].classList.add('initial');
        } else {
            cellVal.innerText = '';
        }
    }
}

// 答え合わせロジックの実装
document.getElementById('check-btn').addEventListener('click', () => {
    const currentBoard = cells.map(cell => cell.querySelector('.cell-val').innerText.trim());
    if (currentBoard.some(num => num === "")) {
        alert("⚠️ まだ空いているマスがあります！すべて埋めてから答え合わせをしてください。");
        return;
    }
    if (isValidSudoku(currentBoard)) {
        alert("🎉 おめでとうございます！正解です！！");
    } else {
        alert("❌ 残念！どこかが間違っているか、数字が重複しています。もう一度見直してみましょう。");
    }
});

function isValidSudoku(board) {
    const rows = Array.from({ length: 9 }, () => new Set());
    const cols = Array.from({ length: 9 }, () => new Set());
    const blocks = Array.from({ length: 9 }, () => new Set());

    for (let i = 0; i < 81; i++) {
        const num = board[i];
        const r = Math.floor(i / 9);
        const c = i % 9;
        const b = Math.floor(r / 3) * 3 + Math.floor(c / 3);

        if (rows[r].has(num) || cols[c].has(num) || blocks[b].has(num)) {
            return false; 
        }
        rows[r].add(num);
        cols[c].add(num);
        blocks[b].add(num);
    }
    return true;
}

document.getElementById('hint-btn').addEventListener('click', () => alert("ヒント（今後実装）"));

// 初回起動時に自動ロード
loadOrGeneratePuzzle();
