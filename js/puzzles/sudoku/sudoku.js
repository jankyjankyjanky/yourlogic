import { onAuthStateChanged, signInWithPopup, signOut } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { auth, provider, fetchOrInitUser, fetchPuzzlesByDifficulty, saveNewPuzzle, saveClearRecord } from "../../services/firebaseService.js";
import { executeHintLogic } from "./modules/hintSystem.js";
import { generatePuzzle } from "./utils/sudokuGenerator.js";
// グローバル状態
let currentUser = null;
let isAdmin = false;               // 📑 管理者フラグ
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
const hintTextArea = document.getElementById('hint-text-area');

// ログイン状態の監視
onAuthStateChanged(auth, async (user) => {
    currentUser = user;
    if (user) {
        loginBtn.style.display = 'none';
        logoutBtn.style.display = 'block';
        
        // 📑 サービスからユーザーデータを取得して管理者判定
        const userData = await fetchOrInitUser(user);
        isAdmin = userData?.isAdmin || false;

        statusText.innerText = isAdmin 
            ? `👑 管理者ログイン中: ${user.displayName}` 
            : `ログイン中: ${user.displayName}`;
    } else {
        statusText.innerText = "ゲストモード（問題の新規自動生成はできません）";
        loginBtn.style.display = 'block';
        logoutBtn.style.display = 'none';
        isAdmin = false;
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
        // サービスから既存ストックを取得
        const availablePuzzles = await fetchPuzzlesByDifficulty(currentDifficulty);
        let targetPuzzle = null;

        if (currentUser) {
            const userData = await fetchOrInitUser(currentUser);
            const clearedPuzzles = userData?.clearedPuzzles || [];

            targetPuzzle = availablePuzzles.find(p => !clearedPuzzles.includes(p.id));

            if (!targetPuzzle) {
                console.log("未プレイの問題がありません。新規生成を試みます...");
                const lastGeneratedAt = userData?.lastGeneratedAt;
                const now = new Date();

                // 📑 管理者（isAdmin）でない場合のみ24時間ロックを判定
                if (lastGeneratedAt && !isAdmin) {
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
                    // サービス経由でDB保存
                    const newId = await saveNewPuzzle(currentUser.uid, currentDifficulty, newPuzzle);
                    targetPuzzle = { id: newId, ...newPuzzle };
                    alert("🎉 あなたの生成コストを消費して、新しい問題を作成しストレージに補充しました！");
                } else {
                    alert("問題の生成に失敗しました。もう一度お試しください。");
                    statusText.innerText = isAdmin ? `👑 管理者ログイン中: ${currentUser.displayName}` : `ログイン中: ${currentUser.displayName}`;
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
                statusText.innerText = isAdmin 
                    ? `👑 管理者ログイン中: ${currentUser.displayName} (パズルID: ${currentPuzzleId})`
                    : `ログイン中: ${currentUser.displayName} (パズルID: ${currentPuzzleId})`;
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
                await saveClearRecord(currentUser.uid, currentPuzzleId);
                console.log(`クリア実績を保存しました (PuzzleID: ${currentPuzzleId})`);
            } catch (e) {
                console.error("クリア実績の保存に失敗:", e);
            }
        }
    } else {
        alert("❌ 残念！どこかが間違っています。もう一度見直してみましょう。");
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
