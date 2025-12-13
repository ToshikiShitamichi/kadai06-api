import { initializeApp } from "https://www.gstatic.com/firebasejs/12.6.0/firebase-app.js";
import { getDatabase, ref, set, push, onValue, update, get, remove, off } from "https://www.gstatic.com/firebasejs/12.6.0/firebase-database.js";
import { getAuth, signInWithPopup, GoogleAuthProvider, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.6.0/firebase-auth.js";

import { firebaseConfig, skyway_api } from "./api.js";

// Firebase 初期化
const app = initializeApp(firebaseConfig);
const db = getDatabase(app);

// 認証関係
const provider = new GoogleAuthProvider();
const auth = getAuth(app);

// グローバル状態
let currentUser = null;
let currentThreadId = localStorage.getItem("current-thread") || null;
let currentRoomId = localStorage.getItem("current-room") || null;
let messageRef = null;
let messageValueCallback = null;

// Realtime Database の基準パス
const THREAD_PATH = "thread";
const ROOM_PATH = "room";
const MESSAGE_PATH = "messages";
const LIKE_PATH = "likes";

// ローカルストレージ key
const LS_KEY_CURRENT_THREAD = "current-thread";
const LS_KEY_CURRENT_ROOM = "current-room";
const LS_KEY_SCROLL = "scroll";

// ref を作るためのヘルパ
const threadRef = ref(db, THREAD_PATH);
const roomRef = ref(db, ROOM_PATH);
function getMessageRef(threadId) {
    const messageRef = ref(db, `${MESSAGE_PATH}/${threadId}`)
    return messageRef
}
function getLikeRef(messageId, userId) {
    const likeRef = ref(db, `${LIKE_PATH}/${messageId}/${userId}`)
    return likeRef
}

// ログイン状態の監視
$("body").addClass("remove-scrolling");
$(".content").hide();

onAuthStateChanged(auth, (user) => {
    currentUser = user;

    if (user) {
        // ユーザーアイコンを表示
        $("#user-icon").html(
            `<img class="user-icon" src="${user.photoURL}">`
        );

        $(".start").hide();
        $(".content").show();
        $("body").removeClass("remove-scrolling");
    }
});

// ログインボタン
$(".start button").on("click", function () {
    signInWithPopup(auth, provider);
});

// スレッド作成
$(".thread-create").on("click", function () {
    // 新規スレッド名入力欄を追加
    $(".thread-list").append('<input id="input-create-thread" type="text">')
    $("#input-create-thread").focus();
});

// フォーカス外れたら入力欄削除
$(document).on("blur", "#input-create-thread", function () {
    $("#input-create-thread").remove();
});

// Enter でスレッド作成
$(document).on("keydown", "#input-create-thread", function (e) {
    if (e.key === "Enter") {
        const title = $("#input-create-thread").val().trim();
        if (title) {
            $(".current-thread").removeClass("current-thread");
            createThread(title);
        }
        $("#input-create-thread").remove();
    }
});

// スレッド作成処理
function createThread(title) {
    // thread/ に新しい push ref を作成
    const newThreadRef = push(threadRef);
    const threadId = newThreadRef.key;

    // スレッドのタイトルを保存
    set(newThreadRef, {
        title: title,
    });

    // カレントスレッドとして保存
    currentThreadId = threadId;
    localStorage.setItem(LS_KEY_CURRENT_THREAD, threadId);
}

// スレッド一覧購読
onValue(threadRef, (snapshot) => {
    $(".thread-list").html("");

    // スナップショットを一旦配列に展開（描画のため）
    const threads = [];
    snapshot.forEach((childSnapshot) => {
        threads.push({
            id: childSnapshot.key,
            title: childSnapshot.val().title,
        });
    });

    // 各スレッドを描画
    threads.forEach((thread) => {
        let itemHtml
        if (currentThreadId === thread.id) {
            itemHtml = `<p class="thread-title current-thread" data-thread-id="${thread.id}">${thread.title}</p>`;
            $(".chat-header").html(`<h3>${thread.title}</h3>`);
        } else {
            itemHtml = `<p class="thread-title" data-thread-id="${thread.id}">${thread.title}</p>`;
        }
        $(".thread-list").append(itemHtml);
    });

    // currentThreadId があればヘッダーと messageRef をセットして購読
    if (currentThreadId) {
        subscribeToMessages(currentThreadId);
    }
});

// スレッドをクリックした時の処理
$(document).on("click", ".thread-title", function () {
    const threadId = $(this).data("thread-id");

    // カレントクラス切り替え
    $(".current-thread").removeClass("current-thread");
    $(this).addClass("current-thread");

    // ヘッダー更新
    $(".chat-header").html(`<h3>${$(this).text()}</h3>`);

    // カレントスレッドIDを保存
    currentThreadId = threadId;
    localStorage.setItem(LS_KEY_CURRENT_THREAD, threadId);

    // メッセージ購読し直し
    subscribeToMessages(threadId);
});


// 現在のスレッドのメッセージ購読
function subscribeToMessages(threadId) {
    if (!threadId) return;

    // 既存 listener があれば off する
    if (messageRef && messageValueCallback) {
        off(messageRef, "value", messageValueCallback);
    }

    // 新しい messageRef を作成
    messageRef = getMessageRef(threadId);

    // コールバックを定義
    messageValueCallback = (snapshot) => {
        $(".chat-list").html("");

        snapshot.forEach((childSnapshot) => {
            const messageId = childSnapshot.key;
            const data = childSnapshot.val();

            const sendUserIcon = data.uI;
            const sendUserName = data.uN;
            const sendDate = data.date;
            const html = data.html;
            const likeCount = data.likeCount;

            const likeRef = getLikeRef(messageId, currentUser.uid);

            // メッセージ 1 件分の HTML
            const msgHtml = `<div class="chat-msg ql-snow" id="${messageId}"><div class="msg-header"><p class="chat-detail"><img class="user-icon" src="${sendUserIcon}"><span class="username">${sendUserName}</span><span class="date">${sendDate}</span></p><div class="user-action"><button class="material-symbols-outlined chat-delete">delete</button></div></div><div class="ql-editor"><div class="chat-html">${html}</div><button class="like-btn material-symbols-outlined">favorite</button><span class="like-count">${likeCount}</span></div></div>`;

            $(".chat-list").append(msgHtml);

            // 自分が「いいね」したかどうかチェック
            get(likeRef).then((likeSnap) => {
                if (likeSnap.val() === true) {
                    $(`.chat-msg#${messageId}`)
                        .find(".like-btn")
                        .addClass("liked");
                }
            });

            // 自分以外の投稿には削除ボタンを非表示
            if (!currentUser || sendUserName !== currentUser.displayName) {
                $(`.chat-msg#${messageId}`)
                    .find(".user-action")
                    .addClass("user-action-none");
            }
        });

        restoreScroll();
    };

    // onValue で購読開始
    onValue(messageRef, messageValueCallback);
}

// 「いいね」ボタン
$(document).on("click", ".like-btn", function () {
    const $btn = $(this);
    const $chatMsg = $btn.closest(".chat-msg");
    const messageId = $chatMsg.attr("id");
    const $count = $btn.siblings(".like-count");

    let likeCount = Number($count.text());
    const likeRef = getLikeRef(messageId, currentUser.uid);

    const isLiked = $btn.hasClass("liked");

    if (!isLiked) {
        $btn.addClass("liked");
        likeCount += 1;
        set(likeRef, true);
    } else {
        $btn.removeClass("liked");
        likeCount -= 1;
        set(likeRef, false);
    }

    $count.text(likeCount);

    // いいね数を message に反映
    if (!currentThreadId) return;
    const postRef = ref(db, `${MESSAGE_PATH}/${currentThreadId}/${messageId}`);
    update(postRef, { likeCount });
});

// メッセージ送信
$("#send").on("click", function () {
    if (!messageRef || !currentUser) return;

    const newPostRef = push(messageRef);
    const date = new Date();

    const formattedDate =
        String(date.getMonth() + 1).padStart(2, "0") +
        "月" +
        String(date.getDate()).padStart(2, "0") +
        "日" +
        String(date.getHours()).padStart(2, "0") +
        ":" +
        String(date.getMinutes()).padStart(2, "0");

    const msg = {
        uI: currentUser.photoURL,
        uN: currentUser.displayName,
        date: formattedDate,
        html: quill.root.innerHTML,
        likeCount: 0,
    };

    set(newPostRef, msg);

    quill.setText("");
});

// メッセージ削除
$(document).on("click", ".chat-delete", function () {
    if (!currentThreadId) return;

    const messageId = $(this).closest(".chat-msg").attr("id");
    const postRef = ref(db, `${MESSAGE_PATH}/${currentThreadId}/${messageId}`);
    remove(postRef);
});

// スクロール制御
function restoreScroll() {
    const savedScroll = localStorage.getItem(LS_KEY_SCROLL);
    if (savedScroll !== null) {
        $(".chat-list").scrollTop(Number(savedScroll));
    }
}

$(".chat-list").on("scroll", function () {
    localStorage.setItem(LS_KEY_SCROLL, $(".chat-list").scrollTop());
});


// ルーム作成
$(".room-create").on("click", function () {
    // 新規ルーム名入力欄を追加
    $(".room-list").append('<input id="input-create-room" type="text">')
    $("#input-create-room").focus();
});

// フォーカス外れたら入力欄削除
$(document).on("blur", "#input-create-room", function () {
    $("#input-create-room").remove();
});

// Enter でルーム作成
$(document).on("keydown", "#input-create-room", function (e) {
    if (e.key === "Enter") {
        const title = $("#input-create-room").val().trim();
        if (title) {
            $(".current-room").removeClass("current-room");
            createRoom(title);
        }
        $("#input-create-room").remove();
    }
});

// ルーム作成処理
function createRoom(title) {
    // room/ に新しい push ref を作成
    const newRoomRef = push(roomRef);
    const roomId = newRoomRef.key;

    // ルームのタイトルを保存
    set(newRoomRef, {
        title: title,
    });

    // カレントルームとして保存
    currentRoomId = roomId;
    localStorage.setItem(LS_KEY_CURRENT_ROOM, roomId);
}

// ルーム一覧購読
onValue(roomRef, (snapshot) => {
    $(".room-list").html("");

    // スナップショットを一旦配列に展開（描画のため）
    const rooms = [];
    snapshot.forEach((childSnapshot) => {
        rooms.push({
            id: childSnapshot.key,
            title: childSnapshot.val().title,
        });
    });

    // 各ルームを描画
    rooms.forEach((room) => {
        let itemHtml
        if (currentRoomId === room.id) {
            itemHtml = `<p class="room-title current-room" data-room-id="${room.id}">${room.title}</p>`;
            $(".video-header").html(`<h3>${room.title}<input id="room-name" type="text" value="${room.title}" hidden><button id="join" class="material-symbols-outlined">video_call</button></h3>`);
        } else {
            itemHtml = `<p class="room-title" data-room-id="${room.id}">${room.title}</p>`;
        }
        $(".room-list").append(itemHtml);
    });

    // currentRoomId があればヘッダーと messageRef をセットして購読
    // if (currentRoomId) {
    //     subscribeToMessages(currentRoomId);
    // }
});

// ルームをクリックした時の処理
$(document).on("click", ".room-title", function () {
    const roomId = $(this).data("room-id");

    // カレントクラス切り替え
    $(".current-room").removeClass("current-room");
    $(this).addClass("current-room");

    // ヘッダー更新
    $(".video-header").html(`<h3>${$(this).text()}<input id="room-name" type="text" value="${$(this).text()}" hidden><button id="join" class="material-symbols-outlined">video_call</button></h3>`);

    // カレントルームIDを保存
    currentRoomId = roomId;
    localStorage.setItem(LS_KEY_CURRENT_ROOM, roomId);

    // メッセージ購読し直し
    // subscribeToMessages(roomId);
});


// ===============
// Quill関係
// ===============
const toolbarOptions = {
    container: [
        ["emoji"],
        ["bold", "italic", "underline", "strike"],
        ["link", { list: "ordered" }, { list: "bullet" }],
        ["code-block"],
    ],
    handlers: {
        emoji: function () { },
    },
};

const quill = new Quill("#editor", {
    theme: "snow",
    placeholder: "スレッドへのメッセージ",
    modules: {
        toolbar: toolbarOptions,
        "emoji-toolbar": true,
        "emoji-shortname": true,
        keyboard: {
            bindings: {
                // Ctrl + Enter で送信
                ctrl_enter: {
                    key: "Enter",
                    ctrlKey: true,
                    handler: function () {
                        $("#send").click();
                        return false;
                    },
                },
                // Tab で送信ボタンにフォーカス
                tab: {
                    key: "Tab",
                    handler: function () {
                        $("#send").focus();
                        return false;
                    },
                },
            },
        },
    },
});

// ===============
// skyway関係
// ===============
const { nowInSec, SkyWayAuthToken, SkyWayContext, SkyWayRoom, SkyWayStreamFactory, uuidV4 } = skyway_room;

$("#home").on("click", function () {
    $("#video").removeClass("current-nav");
    $("#home").addClass("current-nav");
    $(".thread").css("display", "block");
    $(".chat").css("display", "block");
    $(".rooms").css("display", "none");
    $(".video").css("display", "none");
});
$("#video").on("click", function () {
    $("#home").removeClass("current-nav");
    $("#video").addClass("current-nav");
    $(".rooms").css("display", "block");
    $(".video").css("display", "block");
    $(".thread").css("display", "none");
    $(".chat").css("display", "none");
});

// 認証・認可用のトークンを生成
const token = new SkyWayAuthToken({
    jti: uuidV4(),
    iat: nowInSec(),
    exp: nowInSec() + 60 * 60 * 24,
    version: 3,
    scope: {
        appId: "538b3b4b-ba2c-4f04-b09a-5c950933a8dd",
        rooms: [
            {
                name: "*",
                methods: ["create", "close", "updateMetadata"],
                member: {
                    name: "*",
                    methods: ["publish", "subscribe", "updateMetadata"],
                },
            },
        ],
    },
}).encode(skyway_api);

(async () => {
    const localVideo = document.getElementById("local-video");
    const buttonArea = document.getElementById("button-area");
    const remoteVideoArea = document.getElementById("video-grid");
    const remoteAudioArea = document.getElementById("video-grid");

    const myId = document.getElementById("my-id");
    const videoControl = document.querySelector(".video-controls");
    const localAudioMuteButton = document.getElementById("audio-mute");
    const localVideoMuteButton = document.getElementById("video-mute");
    const displayStreamButton = document.getElementById("display-stream");
    const backgroundBlurButton = document.getElementById("background-blur");
    const leaveButton = document.getElementById("leave");

    // 入室前はボタン使えない＋非表示
    localAudioMuteButton.disabled = true;
    localVideoMuteButton.disabled = true;
    displayStreamButton.disabled = true;
    backgroundBlurButton.disabled = true;
    leaveButton.disabled = true;
    if (videoControl) videoControl.style.display = "none";

    let isAudioMuted = true; // 相手にはミュート状態として扱う
    let isVideoMuted = true;

    // 参加ボタンが押された時の処理
    $(document).on("click", "#join", async function () {
        const joinButton = document.getElementById("join");
        const roomNameInput = document.getElementById("room-name");

        // room名が空白の場合はスキップ
        if (roomNameInput.value === "") return;

        // 自分自身の映像・音声を取得して描画（自分のプレビュー）
        const { audio, video } =
            await SkyWayStreamFactory.createMicrophoneAudioAndCameraStream();
        video.attach(localVideo);
        await localVideo.play();

        localAudioMuteButton.disabled = false;
        localVideoMuteButton.disabled = false;
        displayStreamButton.disabled = false;
        backgroundBlurButton.disabled = false
        leaveButton.disabled = false;
        joinButton.disabled = true;
        if (videoControl) videoControl.style.display = "flex";

        // アプリケーションの設定管理の中核となるオブジェクトを生成
        const context = await SkyWayContext.Create(token);

        // Roomの取得もしくは作成
        const room = await SkyWayRoom.FindOrCreate(context, {
            type: "p2p",
            name: roomNameInput.value,
        });

        // Roomに入室して自分のIDを表示
        const me = await room.join({
            name: currentUser.uid,
            metadata: JSON.stringify({ displayName: currentUser.displayName })
        });
        myId.textContent = currentUser.displayName;

        // 自分の映像・音声をpublish
        let localAudioPublication = await me.publish(audio);
        let localVideoPublication = await me.publish(video);
        isAudioMuted = false;
        isVideoMuted = false;
        localAudioMuteButton.textContent = "mic";
        localVideoMuteButton.textContent = "videocam";

        let displayVideoPublication = null;
        let displayVideoStream = null;

        const getDisplayName = (member) => {
            try {
                const obj = JSON.parse(member?.metadata || "{}");
                return obj.displayName || member?.name || member?.id || "Guest";
            } catch (e) {
                return member?.name || member?.id || "Guest";
            }
        };

        // 映像・音声をsubscribeして再生
        const subscribeAndAttach = async (publication) => {
            // 自分自身の映像・音声だったらskip
            if (publication.publisher.id === me.id) return;

            const { stream } = await me.subscribe(publication.id);

            // 他の人の映像・音声を再生する要素を生成
            let remoteMedia;
            switch (stream.track.kind) {
                case "video":
                    const key = publication.publisher.name || publication.publisher.id; // name(uid)優先
                    const tileId = `remote-tile-${key}`; let tile = document.getElementById(tileId);
                    if (!tile) {
                        tile = document.createElement("div");
                        tile.className = "video-tile remote";
                        tile.id = tileId;

                        const label = document.createElement("div");
                        label.className = "video-label";
                        label.textContent = `参加者: ${getDisplayName(publication.publisher)}`;
                        tile.appendChild(label);

                        remoteVideoArea.appendChild(tile);
                    }

                    // video要素
                    remoteMedia = document.createElement("video");
                    remoteMedia.playsInline = true;
                    remoteMedia.autoplay = true;
                    stream.attach(remoteMedia);
                    remoteMedia.id = `remote-media-${publication.id}`;
                    tile.appendChild(remoteMedia);

                    publication.onDisabled.add(() => remoteMedia.load());
                    break;
                case "audio":
                    remoteMedia = document.createElement("audio");
                    remoteMedia.autoplay = true;
                    // 画面には出さないが音だけ鳴らしたい
                    remoteMedia.classList.add("remote-audio");
                    stream.attach(remoteMedia);
                    remoteMedia.id = `remote-media-${publication.id}`;
                    remoteAudioArea.appendChild(remoteMedia);
                    break;
                default:
                    return;
            }
        };

        // Room入室時にすでにpublishされている映像・音声を受信
        room.publications.forEach(subscribeAndAttach);

        // Room入室後に他Memberがpublishした映像・音声を受信
        room.onStreamPublished.add((e) => subscribeAndAttach(e.publication));

        // 送信側の音声一時停止処理
        localAudioMuteButton.onclick = async () => {
            if (isAudioMuted) {
                await localAudioPublication.enable();
                isAudioMuted = false;
                localAudioMuteButton.textContent = "mic";
            } else {
                await localAudioPublication.disable();
                isAudioMuted = true;
                localAudioMuteButton.textContent = "mic_off";
            }
        };

        // 送信側の映像一時停止処理
        localVideoMuteButton.onclick = async () => {
            if (isVideoMuted) {
                await localVideoPublication.enable();
                isVideoMuted = false;
                localVideoMuteButton.textContent = "videocam";
            } else {
                await localVideoPublication.disable();
                isVideoMuted = true;
                localVideoMuteButton.textContent = "videocam_off";
            }
        };

        const stopScreenShare = async () => {
            if (!displayVideoPublication) return;

            // 画面共有の publish を止める
            await me.unpublish(displayVideoPublication.id);
            displayVideoPublication = null;

            // カメラ publish に戻す（入室時のON/OFF状態を維持）
            localVideoPublication = await me.publish(video);
            if (isVideoMuted) await localVideoPublication.disable();
            else await localVideoPublication.enable();

            // 自分プレビューもカメラに戻す
            video.attach(localVideo);
            await localVideo.play();

            displayVideoStream?.track?.stop?.();
            displayVideoStream = null;
        };

        displayStreamButton.onclick = async () => {
            if (displayVideoPublication) {  // 共有中なら停止
                await stopScreenShare();
                return;
            }
            const { audio, video: dispVideo } = await SkyWayStreamFactory.createDisplayStreams(
                {
                    audio: true, // 音声も取得する
                    video: {
                        displaySurface: 'monitor', // 画面全体の映像
                    }
                }
            );
            await me.unpublish(localVideoPublication.id);
            displayVideoPublication = await me.publish(dispVideo);

            // プレビューを共有映像へ
            dispVideo.attach(localVideo);
            await localVideo.play();

            // 共有を「ブラウザの共有停止」ボタンで終えた時も復帰
            dispVideo.track.onended = async () => {
                await stopScreenShare();
            };
        }

        // 自分が退室する処理
        leaveButton.onclick = async () => {
            await localAudioPublication.disable();
            localAudioMuteButton.textContent = "mic_off"
            await localVideoPublication.disable();
            localVideoMuteButton.textContent = "videocam_off";

            await me.leave();
            await room.dispose();

            myId.textContent = "";
            joinButton.disabled = false;
            localAudioMuteButton.disabled = true;
            localVideoMuteButton.disabled = true;
            leaveButton.disabled = true;
            if (videoControl) videoControl.style.display = "none";
            buttonArea?.replaceChildren();
            document.querySelectorAll('[id^="remote-media-"]').forEach(el => el.remove());
            document.querySelectorAll('.remote-audio').forEach(el => el.remove());

        };

        // 他の人が退室した場合の処理
        room.onStreamUnpublished.add((e) => {
            document.getElementById(`remote-media-${e.publication.id}`)?.remove();

            const key = e.publication.publisher.name || e.publication.publisher.id;
            const tile = document.getElementById(`remote-tile-${key}`);
            if (tile && tile.querySelectorAll("video").length === 0) {
                tile.remove();
            }
        });

        // ルームを切り替えた時に退出
        $(document).on("click", ".room-title", async function () {
            if (room && me) {
                leaveButton.click();
            }
        });

    });
})();
