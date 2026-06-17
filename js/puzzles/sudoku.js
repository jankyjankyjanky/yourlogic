import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getAuth, signInWithPopup, GoogleAuthProvider, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { getFirestore, collection, query, where, limit, getDocs } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
// 📑 【新規】共通ソルバーのインポート
import { analyzeSudoku } from "../utils/sudokuSolver.js";

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

let currentInputMode = 'location'; 
let selectedNumber = null;         

// 📑 【新規】現在の問題の模範解答(81文字の文字列)を保持する変数
let currentSolution = "";

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

    cell.addEventListener('click', () => {
        if (currentInputMode === 'auto') {
            if (cell.classList.contains('initial')) {
                updateHighlight(i);
                return;
            }
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
            cellVal.innerText = num;
            selectedCell.classList.add('user-filled');
            memoGrid.querySelectorAll('span').forEach(span => span.innerText = '');

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
    updateNumberPadStatus();

    // 📑 【新規】すべてのマスが埋まったかチェックし、自動で答え合わせを起動
    checkAutoVerify();
}

// 📑 【新規】自動答え合わせ判定
function checkAutoVerify() {
    const currentBoardStr = cells.map(cell => cell.querySelector('.cell-val').innerText.trim() || '0').join('');
    
    // '0'（空きマス）が一切含まれていない場合、自動で答え合わせを実行
    if (!currentBoardStr.includes('0')) {
        // 数字の描画完了を確実にするため、50msだけ遅らせてアラートを出す
        setTimeout(() => {
            executeCheck(true); 
        }, 50);
    }
}

// 数字のボタン色同期
function updateNumberPadStatus() {
    const counts = { '1': 0, '2': 0, '3': 0, '4': 0, '5': 0, '6': 0, '7': 0, '8': 0, '9': 0 };
    cells.forEach(cell => {
        const num = cell.querySelector('.cell-val').innerText.trim();
        if (counts[num] !== undefined) counts[num]++;
    });

    for (let num = 1; num <= 9; num++) {
        const btn = document.querySelector(`.num-pad .num-btn[data-num="${num}"]`);
        if (btn) {
            if (counts[num] >= 9) {
                btn.classList.add('completed');
            } else {
                btn.classList.remove('completed');
            }
        }
    }
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

// 設置モード切り替えイベント
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
    if (e.key === ' ' || e.key.toLowerCase() === 'm') {
        e.preventDefault();
        if (memoBtn) memoBtn.click();
        return;
    }

    if (!selectedCell) return;
    
    if (e.key >= '1' && e.key <= '9') {
        if (currentInputMode === 'auto') {
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
            memoBtn.innerText = "仮置き: ON";
        } else {
            memoBtn.classList.remove('active');
            memoBtn.innerText = "仮置き: OFF";
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
    
    // 📑 【新規】読み込んだ問題文字列をソルバーに通して、模範解答を事前に生成
    const analysis = analyzeSudoku(boardStr);
    if (analysis.solution) {
        currentSolution = analysis.solution;
    } else {
        console.warn("警告: この問題には有効な解答がありません。", analysis.error);
        currentSolution = "";
    }

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
    updateNumberPadStatus();
}

// 📑 【修正】答え合わせ処理の本体（手動・自動兼用）
function executeCheck(isAuto = false) {
    const currentBoardStr = cells.map(cell => cell.querySelector('.cell-val').innerText.trim() || '0').join('');
    
    if (!isAuto && currentBoardStr.includes('0')) {
        alert("⚠️ まだ空いているマスがあります！すべて埋めてから答え合わせをしてください。");
        return;
    }

    // 模範解答（文字列）と完全一致するかをO(1)で超高速判定
    if (currentBoardStr === currentSolution) {
        alert("🎉 おめでとうございます！正解です！！");
    } else {
        alert("❌ 残念！どこかが間違っています。もう一度見直してみましょう。");
    }
}

// 答え合わせボタン
document.getElementById('check-btn').addEventListener('click', () => executeCheck(false));

// 📑 【新規】ヒント機能の本実装
document.getElementById('hint-btn').addEventListener('click', () => {
    if (!selectedCell) {
        alert("ヒントを表示したい空きマスを選択してください。");
        return;
    }
    if (selectedCell.classList.contains('initial')) {
        alert("初期マスの数字はすでに正しい状態です。");
        return;
    }
    if (!currentSolution) {
        alert("解答データが読み込まれていません。");
        return;
    }

    const index = parseInt(selectedCell.dataset.index);
    const correctNum = currentSolution[index];
    
    // ソルバーの答えを現在のマスに適用
    handleInput(correctNum);
});

// 📑 【新規】「諦める」ボタンの実装
document.getElementById('giveup-btn').addEventListener('click', () => {
    if (!currentSolution) {
        alert("解答データが読み込まれていません。");
        return;
    }

    if (confirm("本当に諦めますか？すべてのマスに模範解答が配置されます。")) {
        cells.forEach((cell, i) => {
            if (cell.classList.contains('initial')) return;
            
            const cellVal = cell.querySelector('.cell-val');
            const memoGrid = cell.querySelector('.memo-grid');
            
            cellVal.innerText = currentSolution[i];
            cell.classList.add('user-filled');
            memoGrid.querySelectorAll('span').forEach(span => span.innerText = '');
        });
        
        updateHighlight(null);
        updateNumberPadStatus();
        alert("盤面に模範解答を反映しました。");
    }
});

// 初回起動時に自動ロード
loadOrGeneratePuzzle();
