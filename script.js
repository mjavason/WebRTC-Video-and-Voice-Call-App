// Initialize variables to hold local and remote streams, and the peer connection
let localStream; // Local media stream object
let remoteStream; // Remote media stream object
let peerConnection; // RTCPeerConnection object

let APP_ID = 'cb99dffcd3724a54bbc1301d978df148'; // Agora App ID

let token = null; // Token for authentication
let uid = String(Math.floor(Math.random() * 10000)); // Unique user ID

let queryString = window.location.search;
let urlParams = new URLSearchParams(queryString);

let roomId = urlParams.get('room');
if (!roomId) {
  window.location = 'lobby.html';
}

let client; // Agora Real-Time Messaging client object
let channel; // Agora Real-Time Messaging channel object

// Configuration for ICE servers
const servers = {
  iceServers: [
    {
      urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'],
    },
  ],
};

// Initialization function
let init = async () => {
  // Create and initialize an AgoraRTM client
  client = await AgoraRTM.createInstance(APP_ID);
  // Log in to the AgoraRTM client with a randomly generated user ID and optional token
  await client.login({ uid, token });

  // Create a channel named 'main' and join it
  channel = client.createChannel(roomId);
  await channel.join();

  // Listen for when a new member joins the channel
  channel.on('MemberJoined', handleUserJoined);

  channel.on('MemberLeft', handleUserLeft);

  // Listen for messages from peers
  client.on('MessageFromPeer', handleMessageFromPeer);

  // Get user's local media stream (video only, no audio)
  localStream = await navigator.mediaDevices.getUserMedia(constraints);

  // Display local stream in the first user's video element
  document.getElementById('user-1').srcObject = localStream;

  // Create an offer to start a WebRTC session
  // createOffer();
};

let handleUserLeft = (MemberId) => {
  document.getElementById('user-2').style.display = 'none';
  document.getElementById('user-1').classList.remove('smallFrame');
};

// Handle messages received from peers
let handleMessageFromPeer = async (message, MemberId) => {
  message = JSON.parse(message.text);

  // Process the message based on its type
  if (message.type === 'offer') {
    // Create an answer to the offer
    createAnswer(MemberId, message.offer);
  }

  if (message.type === 'answer') {
    // Add the received answer
    addAnswer(message.answer);
  }

  if (message.type === 'candidate') {
    // Add the ICE candidate to the peer connection
    if (peerConnection) {
      peerConnection.addIceCandidate(message.candidate);
    }
  }
};

// Handle a new user joining the channel
let handleUserJoined = async (MemberId) => {
  console.log('A new user joined this room');
  // Create an offer for the new user
  createOffer(MemberId);
};

// Create a peer connection with a specific member
let createPeerConnection = async (MemberId) => {
  // Create a new RTCPeerConnection with the configured servers
  peerConnection = new RTCPeerConnection(servers);

  // Create a new media stream object for the remote user
  remoteStream = new MediaStream();
  // Display remote stream in the second user's video element
  document.getElementById('user-2').srcObject = remoteStream;
  document.getElementById('user-2').style.display = 'block';

  document.getElementById('user-1').classList.add('smallFrame');

  // If local stream is not already available, get it and display it
  if (!localStream) {
    localStream = await navigator.mediaDevices.getUserMedia(constraints);
    document.getElementById('user-1').srcObject = localStream;
  }

  // Add all tracks from the local stream to the peer connection
  localStream.getTracks().forEach((track) => {
    peerConnection.addTrack(track, localStream);
  });

  // When a track is received from the remote peer, add it to the remote stream
  peerConnection.ontrack = (event) => {
    event.streams[0].getTracks().forEach((track) => {
      remoteStream.addTrack(track);
    });
  };

  // Listen for ICE candidates and send them to the remote peer
  peerConnection.onicecandidate = async (event) => {
    if (event.candidate) {
      client.sendMessageToPeer(
        {
          text: JSON.stringify({
            type: 'candidate',
            candidate: event.candidate,
          }),
        },
        MemberId
      );
    }
  };
};

// Function to create an offer and initiate the WebRTC session
let createOffer = async (MemberId) => {
  await createPeerConnection(MemberId);

  // Create an offer to establish the connection
  let offer = await peerConnection.createOffer();
  // Set the local description of the peer connection to the created offer
  await peerConnection.setLocalDescription(offer);

  // Send the offer to the remote peer
  client.sendMessageToPeer(
    { text: JSON.stringify({ type: 'offer', offer: offer }) },
    MemberId
  );
};

// Create an answer to an offer
let createAnswer = async (MemberId, offer) => {
  await createPeerConnection(MemberId);

  // Set the remote description of the peer connection to the received offer
  await peerConnection.setRemoteDescription(offer);

  // Create an answer to the offer
  let answer = await peerConnection.createAnswer();
  // Set the local description of the peer connection to the created answer
  await peerConnection.setLocalDescription(answer);

  // Send the answer to the remote peer
  client.sendMessageToPeer(
    { text: JSON.stringify({ type: 'answer', answer: answer }) },
    MemberId
  );
};

// Add an answer received from a remote peer
let addAnswer = async (answer) => {
  // If remote description is not already set, set it to the received answer
  if (!peerConnection.currentRemoteDescription) {
    peerConnection.setRemoteDescription(answer);
  }
};

let leaveChannel = async () => {
  await channel.leave();
  await client.logout();
};

let toggleCamera = async () => {
  let videoTrack = localStream
    .getTracks()
    .find((track) => track.kind === 'video');

  if (videoTrack.enabled) {
    videoTrack.enabled = false;
    document.getElementById('camera-btn').style.backgroundColor =
      'rgb(255, 80, 80)';
  } else {
    videoTrack.enabled = true;
    document.getElementById('camera-btn').style.backgroundColor =
      'rgb(179, 102, 249, 0.9)';
  }
};

let toggleMic = async () => {
  let audioTrack = localStream
    .getTracks()
    .find((track) => track.kind === 'audio');

  if (audioTrack.enabled) {
    audioTrack.enabled = false;
    document.getElementById('mic-btn').style.backgroundColor =
      'rgb(255, 80, 80)';
  } else {
    audioTrack.enabled = true;
    document.getElementById('mic-btn').style.backgroundColor =
      'rgb(179, 102, 249, 0.9)';
  }
};

window.addEventListener('beforeunload', leaveChannel);

document.getElementById('camera-btn').addEventListener('click', toggleCamera);
document.getElementById('mic-btn').addEventListener('click', toggleMic);

let constraints = {
  video: {
    width: { min: 640, ideal: 1920, max: 1920 },
    height: { min: 480, ideal: 1080, max: 1080 },
  },
  audio: true,
};

// Initialize the WebRTC session
init();
