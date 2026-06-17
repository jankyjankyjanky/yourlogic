import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getAuth, signInWithPopup, GoogleAuthProvider, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { getFirestore, collection, query, where, getDocs, doc, getDoc, setDoc, updateDoc, arrayUnion, addDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { analyzeSudoku } from "../utils/sudokuSolver.js";
import { generatePuzzle } from "../utils/sudokuGenerator.js";

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

// グローバル状態
let currentUser = null;
let selectedCell = null;
let currentDifficulty = 'easy';
let isMemoMode = false;
let currentInputMode = 'location'; 
let selectedNumber = null;         
let currentSolution = "";
let currentPuzzleId = null;

// DOM要素の取得
const statusText = document.getElementById('auth-status-text');
const loginBtn = document.getElementById('login-btn');
const logoutBtn = document.getElementById('logout-btn');
const memoBtn = document.getElementById('memo-btn');
const modeLocationBtn = document.getElementById('mode-location-btn');
const modeAutoBtn = document.getElementById('mode-auto-btn');

// ログイン状態の監視
onAuthStateChanged(auth, async (user) => {
    currentUser = user;
    if (user) {
        statusText.innerText = `ログイン中: ${user.displayName}`;
        loginBtn.style.display = 'none';
        logoutBtn.style.display = 'block';
        
        const userDocRef = doc(db, "users", user.uid);
        const userDoc = await getDoc(userDocRef);
        if (!userDoc.exists()) {
            await setDoc(userDocRef, {
                lastGeneratedAt: null,
                clearedPuzzles: []
            });
        }
    } else {
        statusText.innerText = "ゲストモード（問題の新規自動生成はできません）";
        loginBtn.style.display = 'block';
        logoutBtn.style.display = 'none';
    }
    loadOrGeneratePuzzle();
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
// スマートハイライト制御関数
function updateHighlight(selectedIndex) {
    cells.forEach(cell => {
        // 📑 通常のハイライトと一緒に、ヒント用のクラス（赤・緑・グレー）も一斉に削除する
        cell.classList.remove(
            'highlight-selected', 'highlight-area', 'highlight-same',
            'highlight-error', 'highlight-hint-target', 'highlight-hint-area'
        );
    });

    // 📑 ヒントのテキストエリアも非表示にして中身をリセットする
    const hintTextArea = document.getElementById('hint-text-area');
    if (hintTextArea) {
        hintTextArea.style.display = 'none';
        hintTextArea.innerText = '';
    }

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
    checkAutoVerify();
}

// 自動答え合わせ判定
function checkAutoVerify() {
    const currentBoardStr = cells.map(cell => cell.querySelector('.cell-val').innerText.trim() || '0').join('');
    if (!currentBoardStr.includes('0')) {
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

// 仮置きモード切替ボタン
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

// オンデマンド問題ロード ＆ 生成システム
async function loadOrGeneratePuzzle() {
    console.log(`難易度「${currentDifficulty}」の処理を開始します...`);
    currentPuzzleId = null;

    try {
        const q = query(
            collection(db, "puzzles"),
            where("type", "==", "sudoku"),
            where("difficulty", "==", currentDifficulty)
        );
        const querySnapshot = await getDocs(q);
        
        let availablePuzzles = [];
        querySnapshot.forEach((doc) => {
            availablePuzzles.push({ id: doc.id, ...doc.data() });
        });

        let targetPuzzle = null;

        if (currentUser) {
            const userDoc = await getDoc(doc(db, "users", currentUser.uid));
            const clearedPuzzles = userDoc.data()?.clearedPuzzles || [];

            targetPuzzle = availablePuzzles.find(p => !clearedPuzzles.includes(p.id));

            if (!targetPuzzle) {
                console.log("未プレイの問題がありません。新規生成を試みます...");
                
                const lastGeneratedAt = userDoc.data()?.lastGeneratedAt;
                const now = new Date();

                if (lastGeneratedAt) {
                    const lastGenTime = lastGeneratedAt.toDate();
                    const diffMs = now - lastGenTime;
                    const diffHours = diffMs / (1000 * 60 * 60);

                    if (diffHours < 24) {
                        const remainHours = Math.ceil(24 - diffHours);
                        alert(`⚠️ この難易度のストックが切れています。\nあなたが新しく問題を生成できるようになるまで、あと約 ${remainHours} 時間必要です。`);
                        return;
                    }
                }

                statusText.innerText = "⏳ 唯一解パズルを自動生成中...";
                let newPuzzle = generatePuzzle(currentDifficulty);
                
                let retry = 0;
                while (!newPuzzle && retry < 3) {
                    newPuzzle = generatePuzzle(currentDifficulty);
                    retry++;
                }

                if (newPuzzle) {
                    const docRef = await addDoc(collection(db, "puzzles"), {
                        type: "sudoku",
                        difficulty: currentDifficulty,
                        problemData: newPuzzle.problemData,
                        solutionData: newPuzzle.solutionData,
                        createdAt: serverTimestamp()
                    });

                    await updateDoc(doc(db, "users", currentUser.uid), {
                        lastGeneratedAt: serverTimestamp()
                    });

                    targetPuzzle = { id: docRef.id, ...newPuzzle };
                    alert("🎉 あなたの生成コストを消費して、新しい問題を作成しストレージに補充しました！");
                } else {
                    alert("問題の生成に失敗しました。もう一度お試しください。");
                    statusText.innerText = `ログイン中: ${currentUser.displayName}`;
                    return;
                }
            }
        } else {
            if (availablePuzzles.length > 0) {
                const randIndex = Math.floor(Math.random() * availablePuzzles.length);
                targetPuzzle = availablePuzzles[randIndex];
            } else {
                alert(`⚠️ 現在、難易度「${currentDifficulty}」の既存ストックがありません。\nログインすると新しい問題を生成して遊ぶことができます！`);
                return;
            }
        }

        if (targetPuzzle) {
            currentPuzzleId = targetPuzzle.id;
            displayPuzzle(targetPuzzle.problemData, targetPuzzle.solutionData);
            if (currentUser) {
                statusText.innerText = `ログイン中: ${currentUser.displayName} (パズルID: ${currentPuzzleId})`;
            }
        }

    } catch (error) {
        console.error("データ処理エラー:", error);
        alert("エラー内容: " + error.message); 
    }
}

// 盤面描画の補助関数
function displayPuzzle(boardStr, solutionStr) {
    updateHighlight(null);
    currentSolution = solutionStr;

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

// 答え合わせ処理
async function executeCheck(isAuto = false) {
    const currentBoardStr = cells.map(cell => cell.querySelector('.cell-val').innerText.trim() || '0').join('');
    
    if (!isAuto && currentBoardStr.includes('0')) {
        alert("⚠️ まだ空いているマスがあります！すべて埋めてから答え合わせをしてください。");
        return;
    }

    if (currentBoardStr === currentSolution) {
        alert("🎉 おめでとうございます！正解です！！");
        
        if (currentUser && currentPuzzleId) {
            try {
                await updateDoc(doc(db, "users", currentUser.uid), {
                    clearedPuzzles: arrayUnion(currentPuzzleId)
                });
                console.log(`クリア実績を保存しました (PuzzleID: ${currentPuzzleId})`);
            } catch (e) {
                console.error("クリア実績の保存に失敗:", e);
            }
        }
    } else {
        alert("❌ 残念！どこかが間違っています。もう一度見直してみましょう。");
    }
}

// ボタンイベントの紐付け
document.getElementById('check-btn').addEventListener('click', () => executeCheck(false));

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
    handleInput(correctNum);
});

// 📑 アップグレード版：3段階ヒントシステム
document.getElementById('hint-btn').addEventListener('click', async () => {
    if (!currentSolution) {
        alert("解答データが読み込まれていません。");
        return;
    }

    const hintTextArea = document.getElementById('hint-text-area');
    hintTextArea.style.display = 'block';
    hintTextArea.style.backgroundColor = '#f0f0f0';
    hintTextArea.style.color = '#333';
    hintTextArea.innerText = ""; // 初期化

    // 前回のヒントハイライトを一度すべてクリア
    cells.forEach(cell => {
        cell.classList.remove('highlight-error', 'highlight-hint-target', 'highlight-hint-area');
    });

    // 現在の盤面状況を配列・文字列として取得
    const currentBoardStr = cells.map(cell => cell.querySelector('.cell-val').innerText.trim() || '0').join('');
    const board = [];
    for (let i = 0; i < 81; i += 9) {
        board.push(currentBoardStr.slice(i, i + 9).split('').map(Number));
    }

    // ==========================================
    // ① ルール上置き間違えているもの(重複)を探索
    // ==========================================
    let conflictIndexes = new Set();

    for (let r = 0; r < 9; r++) {
        for (let c = 0; c < 9; c++) {
            const val = board[r][c];
            if (val === 0) continue;

            const idx = r * 9 + c;
            // 行の重複チェック
            for (let i = 0; i < 9; i++) {
                if (i !== c && board[r][i] === val) { conflictIndexes.add(idx); conflictIndexes.add(r * 9 + i); }
            }
            // 列の重複チェック
            for (let i = 0; i < 9; i++) {
                if (i !== r && board[i][c] === val) { conflictIndexes.add(idx); conflictIndexes.add(i * 9 + c); }
            }
            // ブロックの重複チェック
            const br = Math.floor(r / 3) * 3;
            const bc = Math.floor(c / 3) * 3;
            for (let i = 0; i < 3; i++) {
                for (let j = 0; j < 3; j++) {
                    const tr = br + i;
                    const tc = bc + j;
                    if ((tr !== r || tc !== c) && board[tr][tc] === val) {
                        conflictIndexes.add(idx);
                        conflictIndexes.add(tr * 9 + tc);
                    }
                }
            }
        }
    }

    if (conflictIndexes.size > 0) {
        conflictIndexes.forEach(idx => cells[idx].classList.add('highlight-error'));
        hintTextArea.style.backgroundColor = '#f8d7da';
        hintTextArea.style.color = '#721c24';
        hintTextArea.innerText = "⚠️ ルール上、同じ数字が縦・横・ブロックのどこかで重複しているマスがあります！（赤く表示中）";
        return;
    }

    // ==========================================
    // ② 模範解答と照らし合わせて、間違えているものを探索
    // ==========================================
    let wrongIndexes = [];
    for (let i = 0; i < 81; i++) {
        // 初期マス(initial)ではなく、ユーザーが埋めた数字で、かつ模範解答と違うもの
        if (!cells[i].classList.contains('initial')) {
            const userVal = cells[i].querySelector('.cell-val').innerText.trim();
            if (userVal !== '' && userVal !== currentSolution[i]) {
                wrongIndexes.push(i);
            }
        }
    }

    if (wrongIndexes.length > 0) {
        // 見つかった間違っているマスをすべて赤くハイライト
        wrongIndexes.forEach(idx => cells[idx].classList.add('highlight-error'));
        hintTextArea.style.backgroundColor = '#f8d7da';
        hintTextArea.style.color = '#721c24';
        hintTextArea.innerText = "❌ この数字は間違えています。消してやり直してみましょう。";
        return;
    }

    // ==========================================
    // ③ 次に進むために必要なテクニックを提案
    // ==========================================
    
    // 現在の「正しい盤面」から各マスの候補数字を計算
    let candidates = Array.from({ length: 9 }, () => Array.from({ length: 9 }, () => new Set([1,2,3,4,5,6,7,8,9])));
    for (let r = 0; r < 9; r++) {
        for (let c = 0; c < 9; c++) {
            if (board[r][c] !== 0) {
                candidates[r][c].clear();
                continue;
            }
            for (let i = 0; i < 9; i++) {
                candidates[r][c].delete(board[r][i]);
                candidates[r][c].delete(board[i][c]);
            }
            const br = Math.floor(r / 3) * 3;
            const bc = Math.floor(c / 3) * 3;
            for (let i = 0; i < 3; i++) {
                for (let j = 0; j < 3; j++) {
                    candidates[r][c].delete(board[br + i][bc + j]);
                }
            }
        }
    }

    // 💡 テクニック探索A: Naked Single (単一候補)
    for (let r = 0; r < 9; r++) {
        for (let c = 0; c < 9; c++) {
            if (board[r][c] === 0 && candidates[r][c].size === 1) {
                const targetIdx = r * 9 + c;
                const answerNum = Array.from(candidates[r][c])[0];
                
                // 演出: 対象のマスを緑に、その行・列・ブロックをグレーにハイライト
                highlightHintArea(r, c, targetIdx);
                
                hintTextArea.style.backgroundColor = '#d4edda';
                hintTextArea.style.color = '#155724';
                hintTextArea.innerHTML = `💡 <strong>Naked Single (単一候補)</strong><br>緑色のマスに注目してください。このマスに関連する縦・横・ブロックの数字をすべて除外していくと、残る数字は <strong>「${answerNum}」</strong> だけになります！`;
                return;
            }
        }
    }

    // 💡 テクニック探索B: Hidden Single (隠れた単一 - ブロック優先)
    for (let b = 0; b < 9; b++) {
        const br = Math.floor(b / 3) * 3;
        const bc = (b % 3) * 3;
        
        for (let num = 1; num <= 9; num++) {
            let count = 0;
            let targetR = -1, targetC = -1;
            
            for (let i = 0; i < 3; i++) {
                for (let j = 0; j < 3; j++) {
                    const r = br + i;
                    const c = bc + j;
                    if (board[r][c] === 0 && candidates[r][c].has(num)) {
                        count++;
                        targetR = r; targetC = c;
                    }
                }
            }
            if (count === 1) {
                const targetIdx = targetR * 9 + targetC;
                highlightHintArea(targetR, targetC, targetIdx);
                
                hintTextArea.style.backgroundColor = '#d4edda';
                hintTextArea.style.color = '#155724';
                hintTextArea.innerHTML = `💡 <strong>Hidden Single (隠れた単一)</strong><br>ハイライトされたブロックを見てください。このブロックの中で、数字の <strong>「${num}」</strong> が入れる場所は、緑色のマスしか残されていません！`;
                return;
            }
        }
    }

    // 💡 テクニック探索C: Naked Pair (二国同盟) のヒント
    for (let r = 0; r < 9; r++) {
        for (let c1 = 0; c1 < 9; c1++) {
            if (board[r][c1] === 0 && candidates[r][c1].size === 2) {
                for (let c2 = c1 + 1; c2 < 9; c2++) {
                    if (board[r][c2] === 0 && candidates[r][c2].size === 2) {
                        const arr1 = Array.from(candidates[r][c1]);
                        if (candidates[r][c2].has(arr1[0]) && candidates[r][c2].has(arr1[1])) {
                            // 行内で二国同盟を発見
                            cells[r * 9 + c1].classList.add('highlight-hint-target');
                            cells[r * 9 + c2].classList.add('highlight-hint-target');
                            
                            // その行全体をエリアハイライト
                            for(let i=0; i<9; i++) {
                                if(i !== c1 && i !== c2) cells[r * 9 + i].classList.add('highlight-hint-area');
                            }

                            hintTextArea.style.backgroundColor = '#cee3ff';
                            hintTextArea.style.color = '#004085';
                            hintTextArea.innerHTML = `💡 <strong>Naked Pair (二国同盟)</strong><br>同じ行にある2つの緑色のマスに注目してください。どちらのマスにも <strong>「${arr1[0]}」か「${arr1[1]}」</strong> の2つしか入りません。つまり、この行の他のマス（グレー部分）から、この2つの数字を候補から消去できます！`;
                            return;
                        }
                    }
                }
            }
        }
    }

    // 💡 万が一、用意したロジックで見つからなかった場合（Insane帯など）の救済
    // カンニング的に、まだ埋まっていない最初の空きマスの正しい答えを1つ教えてあげる
    for (let i = 0; i < 81; i++) {
        if (currentBoardStr[i] === '0') {
            cells[i].classList.add('highlight-hint-target');
            hintTextArea.style.backgroundColor = '#fff3cd';
            hintTextArea.style.color = '#856404';
            hintTextArea.innerHTML = `💡 <strong>高度なロジック / 仮定法が必要な局面</strong><br>現在、非常に複雑な盤面になっています。緑色のマスの正しい答えは <strong>「${currentSolution[i]}」</strong> です。ここを突破口にしてみましょう！`;
            return;
        }
    }
});

// 📑 エリアハイライト用の補助関数
function highlightHintArea(r, c, targetIdx) {
    const b = Math.floor(r / 3) * 3 + Math.floor(c / 3);
    cells.forEach((cell, i) => {
        const cellRow = Math.floor(i / 9);
        const cellCol = i % 9;
        const cellBlock = Math.floor(cellRow / 3) * 3 + Math.floor(cellCol / 3);

        if (i === targetIdx) {
            cell.classList.add('highlight-hint-target'); // ターゲット
        } else if (cellRow === r || cellCol === c || cellBlock === b) {
            cell.classList.add('highlight-hint-area');   // 関連エリア
        }
    });
}
