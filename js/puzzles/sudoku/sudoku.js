import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js"; // 💡 signInWithPopup, signOut を削除
import { auth, fetchOrInitUser, saveClearRecord } from "../../services/firebaseService.js"; // 💡 provider を削除
import { executeHintLogic } from "./sudokuHint.js";
import { doc, getDoc, getFirestore } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

// グローバル状態
let currentUser = null;
let isAdmin = false;
let selectedCell = null;
let currentInputMode = 'location'; 
let selectedNumber = null;         
let isMemoMode = false;
let currentSolution = "";
let currentPuzzleId = null;

// ⏱️ タイマー関連の変数
let gameTimerId = null;
let elapsedTime = 0; 
let startTime = null; 

// DOM要素の取得（💡 ログイン・ログアウトボタンの取得を削除）
const statusText = document.getElementById('auth-status-text');
const memoBtn = document.getElementById('memo-btn');
const modeLocationBtn = document.getElementById('mode-location-btn');
const modeAutoBtn = document.getElementById('mode-auto-btn');
const hintTextArea = document.getElementById('hint-text-area');
const timerContainer = document.querySelector('.timer-area'); 
const gameTimerEl = document.getElementById('timer'); 

const urlParams = new URLSearchParams(window.location.search);
const currentDifficulty = urlParams.get('diff') || 'easy';
const targetPuzzleId = urlParams.get('id');

// ログイン状態の監視（💡 ボタンの表示切り替え処理を削除）
onAuthStateChanged(auth, async (user) => {
    currentUser = user;
    if (user) {
        const userData = await fetchOrInitUser(user);
        isAdmin = userData?.isAdmin || false;

        statusText.innerText = isAdmin 
            ? `👑 管理者ログイン中: ${user.displayName}` 
            : `ログイン中: ${user.displayName}`;
    } else {
        statusText.innerText = "ゲストモードプレイ中 (クリア実績はローカルに保存されます)";
        isAdmin = false;
    }

    if (targetPuzzleId) {
        loadSpecificPuzzle(targetPuzzleId);
    } else {
        alert("⚠️ パズルIDが指定されていません。ホーム画面からやり直してください。");
        window.location.href = "../index.html";
    }
});

// 💡 ログイン・ログアウトボタンのイベントリスナーを削除

// ⏱️ 経過時間タイマーの始動ロジック
function startGameTimer() {
    if (gameTimerId) clearInterval(gameTimerId);

    startTime = Date.now(); 
    elapsedTime = 0;

    if (timerContainer) timerContainer.style.display = 'inline-flex';

    function updateDisplay() {
        elapsedTime = Math.floor((Date.now() - startTime) / 1000);
        
        const minutes = Math.floor(elapsedTime / 60);
        const seconds = elapsedTime % 60;
        
        if (gameTimerEl) {
            gameTimerEl.innerText = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
        }
    }

    updateDisplay();
    gameTimerId = setInterval(updateDisplay, 1000);
}

// 特定のパズルデータをFirestoreから1件取得
async function loadSpecificPuzzle(puzzleId) {
    console.log(`パズルID: ${puzzleId} をストレージからロードします...`);
    try {
        const db = getFirestore();
        const puzzleRef = doc(db, "puzzles", puzzleId); 
        const puzzleSnap = await getDoc(puzzleRef);

        if (puzzleSnap.exists()) {
            const puzzleData = puzzleSnap.data();
            currentPuzzleId = puzzleId;
            
            displayPuzzle(puzzleData.problemData, puzzleData.solutionData);
            startGameTimer();

            if (currentUser) {
                statusText.innerText = isAdmin 
                    ? `👑 管理者ログイン中: ${currentUser.displayName} (パズルID: ${currentPuzzleId})`
                    : `ログイン中: ${currentUser.displayName} (パズルID: ${currentPuzzleId})`;
            }
        } else {
            alert("指定されたパズルが見つかりませんでした。");
            window.location.href = "../index.html";
        }
    } catch (error) {
        console.error("パズルロードエラー:", error);
        alert("パズルの読み込みに失敗しました: " + error.message);
    }
}

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
        cell.classList.remove(
            'highlight-selected', 'highlight-area', 'highlight-same',
            'highlight-error', 'highlight-hint-target', 'highlight-hint-area'
        );
    });

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
        setTimeout(() => { executeCheck(true); }, 50);
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
        clearInterval(gameTimerId); 
        
        const minutes = Math.floor(elapsedTime / 60);
        const seconds = elapsedTime % 60;
        alert(`🎉 おめでとうございます！正解です！！\n⏱️ クリアタイム: ${minutes}分${seconds}秒`);
        
        if (currentPuzzleId) {
            try {
                // 💡 ログイン状態に関わらず、saveClearRecordを呼び出す（第1引数で分岐判定）
                const uid = currentUser ? currentUser.uid : null;
                await saveClearRecord(uid, currentPuzzleId, elapsedTime);
                console.log(`クリア実績を記録しました。 (PuzzleID: ${currentPuzzleId})`);
            } catch (e) {
                console.error("クリア実績の保存に失敗:", e);
            }
        }
    } else {
        alert("❌ 残念！どこかが間違っています。もう一度見男してみましょう。");
    }
}

// イベントの紐付け
document.getElementById('check-btn').addEventListener('click', () => executeCheck(false));
document.getElementById('hint-btn').addEventListener('click', () => executeHintLogic(currentSolution, cells, hintTextArea));

document.getElementById('giveup-btn').addEventListener('click', () => {
    if (!currentSolution) {
        alert("解答データが読み込まれていません。");
        return;
    }

    if (confirm("本当に諦めますか？すべてのマスに模範解答が配置されます。")) {
        clearInterval(gameTimerId); 
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
