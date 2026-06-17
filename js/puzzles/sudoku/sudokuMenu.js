// js/puzzles/sudoku/sudokuMenu.js
import { onAuthStateChanged, signInWithPopup, signOut } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { auth, provider, fetchOrInitUser, fetchPuzzlesByDifficulty, saveNewPuzzle, updateUserStamina } from "../../services/firebaseService.js";
import { generatePuzzle } from "./sudokuGenerator.js";

let currentUser = null;
let isAdmin = false;
let currentDifficulty = 'so-easy'; // デフォルト難易度

const statusText = document.getElementById('auth-status-text');
const loginBtn = document.getElementById('login-btn');
const logoutBtn = document.getElementById('logout-btn');
const startBtn = document.getElementById('start-game-btn');

// ログイン監視
onAuthStateChanged(auth, async (user) => {
    currentUser = user;
    if (user) {
        if(loginBtn) loginBtn.style.display = 'none';
        if(logoutBtn) logoutBtn.style.display = 'block';
        const userData = await fetchOrInitUser(user);
        isAdmin = userData?.isAdmin || false;
        statusText.innerText = isAdmin ? `👑 管理者: ${user.displayName}` : `ログイン中: ${user.displayName}`;
    } else {
        statusText.innerText = "ゲストモード（ストック切れ時の新規生成はできません）";
        if(loginBtn) loginBtn.style.display = 'block';
        if(logoutBtn) logoutBtn.style.display = 'none';
        isAdmin = false;
    }
});

if(loginBtn) loginBtn.addEventListener('click', () => signInWithPopup(auth, provider).catch(() => alert("ログイン失敗")));
if(logoutBtn) logoutBtn.addEventListener('click', () => signOut(auth));

// 難易度ボタン切り替え
document.querySelectorAll('.menu-diff-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
        document.querySelectorAll('.menu-diff-btn').forEach(b => b.classList.remove('active'));
        e.target.classList.add('active');
        currentDifficulty = e.target.dataset.diff;
    });
});

/**
 * 💡 スタミナ（生成猶予）を計算するコア関数（5時間に1回復、最大5）
 */
function calculateStamina(userData) {
    const MAX_STAMINA = 5;
    const RECOVERY_TIME_MS = 5 * 60 * 60 * 1000; // 5時間
    const now = new Date();

    if (isAdmin) return { remaining: MAX_STAMINA, recoveredPoints: 0, lastPointUpdatedAt: now };

    // DBにデータがない場合は初期値5、時間はいまを設定
    const savedPoints = userData?.generationPoints !== undefined ? userData.generationPoints : MAX_STAMINA;
    const lastPointUpdatedAt = userData?.lastPointUpdatedAt ? userData.lastPointUpdatedAt.toDate() : now;

    const elapsedMs = now - lastPointUpdatedAt;
    const recoveredPoints = Math.floor(elapsedMs / RECOVERY_TIME_MS);
    const currentStamina = Math.min(MAX_STAMINA, savedPoints + recoveredPoints);

    return {
        remaining: currentStamina,
        recoveredPoints: recoveredPoints,
        lastPointUpdatedAt: lastPointUpdatedAt
    };
}

// 🎯 「パズルを解く」ボタンが押された時のメインフロー
if (startBtn) {
    startBtn.addEventListener('click', async () => {
        startBtn.disabled = true;
        statusText.innerText = "⏳ ストレージを確認中...";

        try {
            // 1. 指定難易度のストックを取得
            const availablePuzzles = await fetchPuzzlesByDifficulty(currentDifficulty);
            let targetPuzzle = null;

            if (currentUser) {
                const userData = await fetchOrInitUser(currentUser);
                const clearedPuzzles = userData?.clearedPuzzles || [];
                
                // まだクリアしていない問題を探す（ケースA）
                targetPuzzle = availablePuzzles.find(p => !clearedPuzzles.includes(p.id));

                // 2. ストックがない場合（生成を試みる）
                if (!targetPuzzle) {
                    console.log("未プレイの問題がありません。生成猶予を確認します...");
                    const stamina = calculateStamina(userData);

                    // ❌ ケースC：生成猶予がない場合（index.htmlのままアラート）
                    if (stamina.remaining <= 0) {
                        alert(`⚠️ 難易度「${currentDifficulty}」のストックが切れています。\nまた、あなたの生成猶予（スタミナ）も 0 のため、新しく問題を生成できません。\n時間が経って回復するのを待つか、他の難易度をお試しください。`);
                        statusText.innerText = `ログイン中: ${currentUser.displayName}`;
                        startBtn.disabled = false;
                        return;
                    }

                    // ⭕ ケースB：生成猶予がある場合
                    statusText.innerText = "⏳ 新しい唯一解パズルを自動生成中...";
                    let newPuzzle = generatePuzzle(currentDifficulty);
                    let retry = 0;
                    while (!newPuzzle && retry < 3) {
                        newPuzzle = generatePuzzle(currentDifficulty);
                        retry++;
                    }

                    if (newPuzzle) {
                        // パズルをFirestoreに保存
                        const newId = await saveNewPuzzle(currentUser.uid, currentDifficulty, newPuzzle);
                        targetPuzzle = { id: newId, ...newPuzzle };

                        // 💡 消費後のスタミナ計算（端数時間を損なわない処理）
                        const newPoints = stamina.remaining - 1;
                        let newLastPointUpdatedAt = new Date();
                        if (stamina.remaining < 5) {
                            // 満タン未満なら、今回回復した時間分だけベースを進める（端数をキープ）
                            newLastPointUpdatedAt = new Date(stamina.lastPointUpdatedAt.getTime() + (stamina.recoveredPoints * 5 * 60 * 60 * 1000));
                        }
                        
                        // スタミナ消費をDBに保存
                        await updateUserStamina(currentUser.uid, newPoints, newLastPointUpdatedAt);
                        alert(`🎉 あなたの生成猶予を1消費して（残: ${newPoints}回）、新しい問題を補充しました！`);
                    } else {
                        alert("問題の生成に失敗しました。もう一度お試しください。");
                        startBtn.disabled = false;
                        return;
                    }
                }
            } else {
                // ゲストモードの場合
                if (availablePuzzles.length > 0) {
                    const randIndex = Math.floor(Math.random() * availablePuzzles.length);
                    targetPuzzle = availablePuzzles[randIndex];
                } else {
                    alert(`⚠️ 現在、難易度「${currentDifficulty}」の既存ストックがありません。\nログインすると新しい問題を生成して遊ぶことができます！`);
                    startBtn.disabled = false;
                    return;
                }
            }

            // 3. パズルデータが確定したら localStorage に保存して画面遷移！
            if (targetPuzzle) {
                localStorage.setItem('sudoku_current_puzzle', JSON.stringify({
                    id: targetPuzzle.id,
                    problemData: targetPuzzle.problemData,
                    solutionData: targetPuzzle.solutionData,
                    difficulty: currentDifficulty
                }));

                // ゲーム画面へ遷移
                window.location.href = 'puzzles/sudoku.html';
            }

        } catch (error) {
            console.error("エラーが発生しました:", error);
            alert("エラー内容: " + error.message);
            startBtn.disabled = false;
        }
    });
}
