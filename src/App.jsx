import React, { useState, useEffect, useCallback } from 'react';
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, onAuthStateChanged, signInWithCustomToken } from 'firebase/auth';
import { getFirestore, doc, setDoc, getDoc, onSnapshot, updateDoc, arrayUnion, collection, deleteDoc } from 'firebase/firestore';
import { Sparkles, Users, Gamepad2, Settings, Copy, Share2, Play, ChevronLeft, Crown, User, ArrowRight, LogOut, CheckCircle, XCircle, Link as LinkIcon, SlidersHorizontal } from 'lucide-react';

// --- FIREBASE CONFIGURATION ---
// This will be read from Vercel's environment variables in the deployed version
const firebaseConfig = JSON.parse(import.meta.env.VITE_FIREBASE_CONFIG || '{}');
const initialAuthToken = typeof __initial_auth_token !== 'undefined' ? __initial_auth_token : null;
const appId = typeof __app_id !== 'undefined' ? __app_id : 'default-trivia-app';

// --- FIREBASE INITIALIZATION ---
let app;
let auth;
let db;

try {
    if (firebaseConfig.apiKey && firebaseConfig.projectId) {
        app = initializeApp(firebaseConfig);
        auth = getAuth(app);
        db = getFirestore(app);
    } else {
        throw new Error("Firebase config not found or incomplete.");
    }
} catch (error) {
    console.error(error.message);
}

// --- HELPER FUNCTIONS ---
const generateRoomCode = () => {
    return Math.random().toString(36).substring(2, 8).toUpperCase();
};

const generateRandomName = () => {
    const adjectives = ["Clever", "Swift", "Witty", "Curious", "Brave", "Silent", "Daring", "Happy", "Lucky"];
    const nouns = ["Fox", "Jaguar", "Panda", "Raptor", "Lion", "Owl", "Wolf", "Monkey", "Eagle"];
    return `${adjectives[Math.floor(Math.random() * adjectives.length)]} ${nouns[Math.floor(Math.random() * nouns.length)]}`;
};

const shuffleArray = (array) => {
    return [...array].sort(() => Math.random() - 0.5);
};

// --- API & DATA HOOKS ---
const useTriviaAPI = () => {
    const fetchCategories = useCallback(async () => {
        try {
            const response = await fetch('https://opentdb.com/api_category.php');
            const data = await response.json();
            return data.trivia_categories;
        } catch (error) {
            console.error('Failed to fetch categories:', error);
            return [];
        }
    }, []);

    const fetchQuestions = useCallback(async ({ amount = 10, category = '', difficulty = '' }) => {
        // Build the URL with the selected settings
        let url = `https://opentdb.com/api.php?amount=${amount}&type=multiple`;
        if (category) url += `&category=${category}`;
        if (difficulty) url += `&difficulty=${difficulty}`;
        
        try {
            const response = await fetch(url);
            if (!response.ok) throw new Error('Network response was not ok');
            const data = await response.json();
            if (data.response_code !== 0) {
                 // Fallback if the API can't provide questions for the specific combo
                console.error("Trivia API error, fetching general questions instead.");
                return fetchQuestions({ amount: 10 }); 
            }
            return data.results.map(q => ({
                question: q.question,
                correctAnswer: q.correct_answer,
                incorrectAnswers: q.incorrect_answers,
                answers: shuffleArray([q.correct_answer, ...q.incorrect_answers]),
                category: q.category,
                difficulty: q.difficulty,
            }));
        } catch (error) {
            console.error('Failed to fetch trivia questions:', error);
            return []; // Return empty array on failure
        }
    }, []);

    return { fetchCategories, fetchQuestions };
};


// --- UI COMPONENTS ---
const LoadingSpinner = ({ text = "Loading..."}) => (
    <div className="flex flex-col justify-center items-center h-full">
        <div className="animate-spin rounded-full h-16 w-16 border-t-4 border-b-4 border-purple-500"></div>
        <p className="mt-4 text-white">{text}</p>
    </div>
);

const CustomModal = ({ title, children, onClose }) => (
    <div className="fixed inset-0 bg-black bg-opacity-75 flex justify-center items-center z-50 p-4">
        <div className="bg-gray-800 border border-gray-700 rounded-2xl shadow-lg p-8 w-full max-w-md text-white text-center">
            <h2 className="text-2xl font-bold mb-6">{title}</h2>
            <div>{children}</div>
            <button
                onClick={onClose}
                className="mt-8 w-full bg-purple-600 hover:bg-purple-700 text-white font-bold py-3 px-4 rounded-lg transition-transform transform hover:scale-105"
            >
                Close
            </button>
        </div>
    </div>
);

// --- MAIN APP COMPONENTS ---

const MainMenu = ({ setView, setGameMode }) => (
    <div className="w-full max-w-md mx-auto p-4 flex flex-col items-center justify-center h-full text-center">
        <div className="mb-10">
            <Gamepad2 className="mx-auto h-16 w-16 text-purple-400" />
            <h1 className="text-5xl font-bold text-white mt-4">Trivia Questions</h1>
            <p className="text-gray-400 mt-2">made by Alf</p>
        </div>
        <div className="w-full space-y-4">
            <button
                onClick={() => { setGameMode('single'); setView('settings'); }}
                className="w-full bg-gradient-to-r from-purple-600 to-blue-500 text-white font-bold py-4 px-6 rounded-xl text-lg flex items-center justify-center gap-3 transition-transform transform hover:scale-105 shadow-lg"
            >
                <User /> Single Player
            </button>
            <button
                onClick={() => { setGameMode('multiplayer'); setView('settings'); }}
                className="w-full bg-gradient-to-r from-green-500 to-teal-400 text-white font-bold py-4 px-6 rounded-xl text-lg flex items-center justify-center gap-3 transition-transform transform hover:scale-105 shadow-lg"
            >
                <Users /> Multiplayer
            </button>
        </div>
    </div>
);

const SettingsScreen = ({ setView, setGameSettings, gameMode }) => {
    const [categories, setCategories] = useState([]);
    const [loading, setLoading] = useState(true);
    const [settings, setSettings] = useState({ amount: 10, category: '', difficulty: '' });
    const { fetchCategories } = useTriviaAPI();

    useEffect(() => {
        const loadCategories = async () => {
            const fetchedCategories = await fetchCategories();
            setCategories(fetchedCategories);
            setLoading(false);
        };
        loadCategories();
    }, [fetchCategories]);

    const handleContinue = () => {
        setGameSettings(settings);
        setView('enterName');
    };

    if (loading) return <LoadingSpinner text="Fetching categories..."/>;

    return (
        <div className="w-full max-w-lg mx-auto p-4 flex flex-col justify-center h-full">
            <div className="text-center mb-6">
                <SlidersHorizontal className="mx-auto h-12 w-12 text-purple-400" />
                <h1 className="text-4xl font-bold text-white mt-4">Game Settings</h1>
                <p className="text-gray-400 mt-2">Customize your trivia experience</p>
            </div>
            
            <div className="space-y-6 bg-gray-800/50 p-6 rounded-2xl">
                {/* Number of Questions */}
                <div>
                    <label htmlFor="amount" className="block text-lg font-medium text-white mb-2">Number of Questions: <span className="font-bold text-purple-400">{settings.amount}</span></label>
                    <input type="range" id="amount" min="5" max="20" step="1" value={settings.amount} onChange={e => setSettings({...settings, amount: Number(e.target.value)})}
                        className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-purple-500"/>
                </div>

                {/* Difficulty */}
                <div>
                    <label className="block text-lg font-medium text-white mb-2">Difficulty</label>
                    <div className="flex gap-2">
                        {['', 'easy', 'medium', 'hard'].map(diff => (
                            <button key={diff} onClick={() => setSettings({...settings, difficulty: diff})}
                                className={`flex-1 py-2 px-3 rounded-lg capitalize text-sm font-bold transition-colors ${settings.difficulty === diff ? 'bg-purple-600 text-white' : 'bg-gray-700 hover:bg-gray-600 text-gray-300'}`}>
                                {diff || 'Any'}
                            </button>
                        ))}
                    </div>
                </div>

                {/* Category */}
                <div>
                    <label htmlFor="category" className="block text-lg font-medium text-white mb-2">Category</label>
                    <select id="category" value={settings.category} onChange={e => setSettings({...settings, category: e.target.value})}
                        className="w-full bg-gray-700 text-white border-2 border-gray-600 rounded-lg p-3 focus:outline-none focus:border-purple-500">
                        <option value="">Any Category</option>
                        {categories.map(cat => <option key={cat.id} value={cat.id}>{cat.name}</option>)}
                    </select>
                </div>
            </div>

            <div className="mt-8 flex gap-4">
                <button onClick={() => setView('mainMenu')} className="w-full bg-gray-600 hover:bg-gray-700 text-white font-bold py-3 px-4 rounded-lg transition-transform transform hover:scale-105">
                    <ChevronLeft className="inline-block mr-1" size={20}/> Back
                </button>
                <button onClick={handleContinue} className="w-full bg-gradient-to-r from-purple-600 to-blue-500 text-white font-bold py-3 px-4 rounded-lg transition-transform transform hover:scale-105">
                    Continue <ArrowRight className="inline-block ml-1" size={20}/>
                </button>
            </div>
        </div>
    );
};

const EnterName = ({ setView, setPlayerName, gameMode, playerName, directJoinRoomId, handleJoinRoom }) => {
    const [name, setName] = useState(playerName);

    const handleSubmit = (e) => {
        e.preventDefault();
        let finalName = name.trim();
        if (!finalName) {
            finalName = generateRandomName();
        }
        setPlayerName(finalName);

        if (directJoinRoomId) {
             handleJoinRoom(directJoinRoomId, finalName);
        } else if (gameMode === 'single') {
            setView('game');
        } else {
            setView('multiplayerMenu');
        }
    };

    return (
        <div className="w-full max-w-md mx-auto p-4 flex flex-col items-center justify-center h-full">
            <div className="text-center mb-10">
                <Users className="mx-auto h-12 w-12 text-purple-400" />
                <h1 className="text-4xl font-bold text-white mt-4">
                    {directJoinRoomId ? "Joining Game" : "Enter Your Name"}
                </h1>
                <p className="text-gray-400 mt-2">Enter your name or continue with a random one.</p>
            </div>
            <form onSubmit={handleSubmit} className="w-full space-y-6">
                <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Clever Player"
                    className="w-full bg-gray-700 text-white placeholder-gray-400 border-2 border-gray-600 rounded-lg py-3 px-4 text-center text-lg focus:outline-none focus:border-purple-500 transition-colors"
                />
                <div className="flex gap-4">
                    <button
                        type="button"
                        onClick={() => setView('settings')}
                        className="w-full bg-gray-600 hover:bg-gray-700 text-white font-bold py-3 px-4 rounded-lg transition-transform transform hover:scale-105"
                    >
                         <ChevronLeft className="inline-block mr-1" size={20}/> Back
                    </button>
                    <button
                        type="submit"
                        className="w-full bg-gradient-to-r from-purple-600 to-blue-500 text-white font-bold py-3 px-4 rounded-lg transition-transform transform hover:scale-105"
                    >
                        Continue <ArrowRight className="inline-block ml-1" size={20}/>
                    </button>
                </div>
            </form>
        </div>
    );
};

const MultiplayerMenu = ({ setView, setRoomId, userId, playerName, handleJoinRoom, gameSettings }) => {
    const [joinCode, setJoinCode] = useState('');
    const [error, setError] = useState('');
    const { fetchQuestions } = useTriviaAPI();

    const handleCreateRoom = async () => {
        const newRoomId = generateRoomCode();
        setRoomId(newRoomId);
        const questions = await fetchQuestions(gameSettings);
        if (questions.length === 0) {
            setError('Could not fetch questions with these settings. Please try again.');
            return;
        }
        const roomDocRef = doc(db, `artifacts/${appId}/public/data/rooms/${newRoomId}`);

        try {
            await setDoc(roomDocRef, {
                hostId: userId,
                players: [{ uid: userId, name: playerName, score: 0 }],
                questions,
                gameSettings,
                currentQuestionIndex: 0,
                gameState: 'waiting',
                createdAt: new Date(),
                answers: {},
            });
            setView('lobby');
        } catch (e) {
            console.error("Error creating room: ", e);
            setError('Could not create room. Please try again.');
        }
    };
    
    const onJoinSubmit = async (e) => {
        e.preventDefault();
        if (!joinCode.trim()) return;
        await handleJoinRoom(joinCode, playerName, setError);
    };
    
    return (
        <div className="w-full max-w-md mx-auto p-4 flex flex-col items-center justify-center h-full">
            <div className="text-center mb-10">
                <Users className="mx-auto h-12 w-12 text-green-400" />
                <h1 className="text-4xl font-bold text-white mt-4">Multiplayer</h1>
                <p className="text-gray-400 mt-2">Create a room or join a friend's</p>
            </div>
            {error && <p className="text-red-400 bg-red-900/50 p-3 rounded-lg mb-4">{error}</p>}
            <div className="w-full space-y-4">
                <button
                    onClick={handleCreateRoom}
                    className="w-full bg-gradient-to-r from-green-500 to-teal-400 text-white font-bold py-4 px-6 rounded-xl text-lg flex items-center justify-center gap-3 transition-transform transform hover:scale-105 shadow-lg"
                >
                    Create Room
                </button>
                <p className="text-center text-gray-400">OR</p>
                <form onSubmit={onJoinSubmit} className="w-full space-y-4">
                    <input
                        type="text"
                        value={joinCode}
                        onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                        placeholder="ENTER ROOM CODE"
                        className="w-full bg-gray-700 text-white placeholder-gray-400 border-2 border-gray-600 rounded-lg py-3 px-4 text-center tracking-widest font-mono text-lg focus:outline-none focus:border-pink-500 transition-colors"
                        maxLength="6"
                    />
                    <button
                        type="submit"
                        className="w-full bg-gradient-to-r from-pink-600 to-purple-500 text-white font-bold py-3 px-4 rounded-lg transition-transform transform hover:scale-105 disabled:opacity-50 disabled:cursor-not-allowed"
                        disabled={!joinCode.trim()}
                    >
                        Join Room
                    </button>
                </form>
            </div>
             <button
                type="button"
                onClick={() => setView('settings')}
                className="mt-8 bg-gray-600 hover:bg-gray-700 text-white font-bold py-3 px-4 rounded-lg transition-transform transform hover:scale-105"
            >
                <ChevronLeft className="inline-block mr-1" size={20}/> Back
            </button>
        </div>
    );
};

const Lobby = ({ setView, roomId, userId }) => {
    const [room, setRoom] = useState(null);
    const [isHost, setIsHost] = useState(false);
    const [copied, setCopied] = useState('');
    const [error, setError] = useState('');

    useEffect(() => {
        if (!roomId || !db) {
            setView('multiplayerMenu');
            return;
        }
        const roomDocRef = doc(db, `artifacts/${appId}/public/data/rooms/${roomId}`);
        const unsubscribe = onSnapshot(roomDocRef, (doc) => {
            if (doc.exists()) {
                const data = doc.data();
                setRoom(data);
                setIsHost(data.hostId === userId);
                if (data.gameState === 'playing') {
                    setView('game');
                }
            } else {
                setError('This room no longer exists.');
                setTimeout(() => {
                    setView('multiplayerMenu');
                }, 3000)
            }
        });
        return () => unsubscribe();
    }, [roomId, userId, setView]);

    const handleStartGame = async () => {
        const roomDocRef = doc(db, `artifacts/${appId}/public/data/rooms/${roomId}`);
        try {
            await updateDoc(roomDocRef, { gameState: 'playing' });
        } catch (e) {
            console.error("Error starting game: ", e);
            setError('Failed to start the game.');
        }
    };
    
    const handleLeaveRoom = async () => {
        if (!room) return;
        try {
            const roomDocRef = doc(db, `artifacts/${appId}/public/data/rooms/${roomId}`);
            const updatedPlayers = room.players.filter(p => p.uid !== userId);

            if (updatedPlayers.length === 0) {
                await deleteDoc(roomDocRef);
            } else {
                const newHostId = (isHost && updatedPlayers.length > 0) ? updatedPlayers[0].uid : room.hostId;
                await updateDoc(roomDocRef, { players: updatedPlayers, hostId: newHostId });
            }
            setView('mainMenu');
        } catch (e) {
            console.error("Error leaving room: ", e);
            setError('Could not leave the room.');
        }
    };

    const copyToClipboard = (text, type) => {
        const textArea = document.createElement('textarea');
        textArea.value = text;
        document.body.appendChild(textArea);
        textArea.select();
        try {
            document.execCommand('copy');
            setCopied(type);
            setTimeout(() => setCopied(''), 2000);
        } catch (err) {
            console.error('Failed to copy: ', err);
        }
        document.body.removeChild(textArea);
    };

    if (error) {
        return <div className="w-full max-w-md mx-auto p-4 flex flex-col items-center justify-center h-full text-white"><XCircle className="h-16 w-16 text-red-500 mb-4" /><h2 className="text-2xl font-bold">{error}</h2><p className="text-gray-400">Redirecting you...</p></div>
    }
    if (!room) return <LoadingSpinner />;

    const shareLink = `${window.location.origin}${window.location.pathname}?room=${roomId}`;

    return (
        <div className="w-full max-w-lg mx-auto p-4 flex flex-col items-center justify-center h-full">
             <div className="w-full text-center mb-6">
                <div className="w-20 h-20 mx-auto rounded-full bg-purple-500/20 flex items-center justify-center mb-4"><div className="w-16 h-16 rounded-full bg-purple-500/30 flex items-center justify-center animate-pulse"><Users className="h-8 w-8 text-purple-300"/></div></div>
                <h1 className="text-2xl font-bold text-white">{isHost ? "You are the host!" : "Waiting for host to start..."}</h1>
                <p className="text-gray-400 mt-1">Share the room code or link with your friends!</p>
            </div>
            
            <div className="bg-gray-800/50 border border-gray-700 p-3 rounded-xl flex items-center justify-center gap-2 mb-2">
                <span className="text-gray-300">Code:</span>
                <span className="text-2xl font-bold text-white tracking-widest font-mono">{roomId}</span>
                <button onClick={() => copyToClipboard(roomId, 'code')} className="bg-gray-700 hover:bg-gray-600 text-white p-2 rounded-lg transition-colors"><Copy size={18} /></button>
            </div>
            <div className="bg-gray-800/50 border border-gray-700 p-3 rounded-xl flex items-center justify-center gap-2 mb-6">
                 <span className="text-gray-300">Link:</span>
                <button onClick={() => copyToClipboard(shareLink, 'link')} className="bg-gray-700 hover:bg-gray-600 text-white p-2 rounded-lg transition-colors flex items-center gap-2">
                    <LinkIcon size={18} /> Copy Invite Link
                </button>
            </div>
            <p className="text-sm text-green-400 mb-6 h-5 transition-opacity duration-300">{copied ? `Copied ${copied} to clipboard!` : ''}</p>


            <div className="w-full bg-gray-800/50 border border-gray-700 rounded-xl p-6 mb-8"><h3 className="text-white font-bold text-lg mb-4 text-center">Players in room ({room.players.length})</h3><div className="space-y-3 max-h-48 overflow-y-auto">{room.players.map(player => (<div key={player.uid} className="bg-gray-700/50 p-3 rounded-lg flex items-center justify-between"><span className="text-white font-semibold">{player.name}</span>{player.uid === room.hostId && <Crown size={20} className="text-yellow-400" />}</div>))}</div></div>

            <div className="w-full flex flex-col space-y-3">
                {isHost && (<button onClick={handleStartGame} disabled={room.players.length < 1} className="w-full bg-gradient-to-r from-green-500 to-teal-400 text-white font-bold py-4 rounded-xl text-lg flex items-center justify-center gap-3 transition-transform transform hover:scale-105 disabled:opacity-50 disabled:grayscale disabled:cursor-not-allowed"><Play /> Start Game</button>)}
                 <button onClick={handleLeaveRoom} className="w-full bg-gray-600 hover:bg-gray-700 text-white font-bold py-3 px-4 rounded-lg transition-transform transform hover:scale-105"><LogOut className="inline-block mr-2" size={20}/> Leave Room</button>
            </div>
        </div>
    );
};

const Game = ({ gameMode, roomId, userId, setView, playerName, gameSettings }) => {
    const [gameData, setGameData] = useState(null);
    const [selectedAnswer, setSelectedAnswer] = useState(null);
    const [isAnswered, setIsAnswered] = useState(false);
    const { fetchQuestions } = useTriviaAPI();
    const [modalContent, setModalContent] = useState(null);
    
    useEffect(() => {
        const setupGame = async () => {
            if (gameMode === 'multiplayer') {
                if (!roomId || !db) return;
                const roomDocRef = doc(db, `artifacts/${appId}/public/data/rooms/${roomId}`);
                const unsubscribe = onSnapshot(roomDocRef, (doc) => {
                    if (doc.exists()) {
                        const data = doc.data();
                        setGameData(data);
                        const myAnswer = data.answers ? data.answers[userId] : undefined;
                        if(myAnswer !== undefined) { setIsAnswered(true); setSelectedAnswer(myAnswer); } else { setIsAnswered(false); setSelectedAnswer(null); }
                        if(data.gameState === 'finished') {
                            const sortedPlayers = [...data.players].sort((a,b) => b.score - a.score);
                            setModalContent({ title: "Game Over!", body: <WinnerDisplay players={sortedPlayers} /> });
                        }
                    } else {
                         setModalContent({ title: "Error", body: <p>The game room was not found. It might have been deleted.</p> });
                    }
                });
                return unsubscribe;
            } else {
                const questions = await fetchQuestions(gameSettings);
                if (questions.length === 0) {
                     setModalContent({ title: "Error", body: <p>Could not load questions for these settings. Please try again.</p> });
                     return;
                }
                setGameData({
                    questions,
                    currentQuestionIndex: 0,
                    players: [{ uid: userId, name: playerName, score: 0 }],
                    gameState: 'playing',
                    answers: {}
                });
            }
        };
        const unsubscribePromise = setupGame();
        return () => { unsubscribePromise.then(unsub => unsub && unsub()); };
    }, [gameMode, roomId, userId, playerName, fetchQuestions, gameSettings]);

    const handleAnswerSelect = async (answer) => {
        if (isAnswered) return;
        
        setSelectedAnswer(answer);
        setIsAnswered(true);

        const currentQuestion = gameData.questions[gameData.currentQuestionIndex];
        const isCorrect = answer === currentQuestion.correctAnswer;
        
        if (gameMode === 'multiplayer') {
            const roomDocRef = doc(db, `artifacts/${appId}/public/data/rooms/${roomId}`);
            const newAnswers = { ...gameData.answers, [userId]: answer };
            
            const payload = { answers: newAnswers };
            
            if (isCorrect) {
                const updatedPlayers = gameData.players.map(p => {
                    if (p.uid === userId) {
                        return { ...p, score: p.score + 1 };
                    }
                    return p;
                });
                payload.players = updatedPlayers;
            }
            
            await updateDoc(roomDocRef, payload);

        } else {
            if (isCorrect) {
                setGameData(prev => ({ ...prev, players: [{...prev.players[0], score: prev.players[0].score + 1 }] }));
            }
        }
    };
    
    const handleNextQuestion = async () => {
        if (gameMode === 'multiplayer') {
            const isHost = gameData.hostId === userId;
            if (!isHost) return;

            const roomDocRef = doc(db, `artifacts/${appId}/public/data/rooms/${roomId}`);
            const nextIndex = gameData.currentQuestionIndex + 1;
            
            if (nextIndex < gameData.questions.length) {
                await updateDoc(roomDocRef, { currentQuestionIndex: nextIndex, answers: {} });
            } else {
                await updateDoc(roomDocRef, { gameState: 'finished' });
            }
        } else {
             const nextIndex = gameData.currentQuestionIndex + 1;
             if (nextIndex < gameData.questions.length) {
                setGameData(prev => ({ ...prev, currentQuestionIndex: nextIndex }));
                setIsAnswered(false);
                setSelectedAnswer(null);
             } else {
                setGameData(prev => ({...prev, gameState: 'finished' }));
                const sortedPlayers = [...gameData.players].sort((a,b) => b.score - a.score);
                setModalContent({ title: "Game Over!", body: <WinnerDisplay players={sortedPlayers} /> });
             }
        }
    };
    
    const handleLeaveGame = () => setView('mainMenu');
    
    if (!gameData || !gameData.questions || gameData.questions.length === 0) {
        return <LoadingSpinner text="Fetching questions..."/>;
    }
    
    const currentQuestion = gameData.questions[gameData.currentQuestionIndex];
    const myPlayer = gameData.players.find(p => p.uid === userId) || gameData.players[0];
    const isHost = gameMode === 'multiplayer' ? gameData.hostId === userId : true;
    const allPlayersAnswered = gameMode === 'multiplayer' ? gameData.players.length === Object.keys(gameData.answers || {}).length : isAnswered;

    const getAnswerClass = (answer) => {
        if (!allPlayersAnswered) return 'bg-gray-700 hover:bg-gray-600 border-gray-600';
        const isCorrect = answer === currentQuestion.correctAnswer;
        if(isCorrect) return 'bg-green-500/50 border-green-500 animate-pulse-fast';
        if (answer === selectedAnswer && !isCorrect) return 'bg-red-500/50 border-red-500';
        return 'bg-gray-800 border-gray-700 opacity-70';
    };
    
    return (
        <div className="w-full max-w-4xl mx-auto p-2 sm:p-4 flex flex-col h-screen max-h-screen text-white">
            {modalContent && <CustomModal title={modalContent.title} onClose={() => { setModalContent(null); handleLeaveGame(); }}>{modalContent.body}</CustomModal>}
            <header className="flex-shrink-0 flex justify-between items-center mb-2 sm:mb-4">
                <span className="bg-purple-500/20 text-purple-300 font-bold px-3 py-1.5 sm:px-4 sm:py-2 rounded-lg text-xs sm:text-base">Question #{gameData.currentQuestionIndex + 1}</span>
                <div className="text-center"><p className="font-bold text-lg sm:text-xl">Score: {myPlayer.score}</p>{gameMode === 'multiplayer' && <p className="text-gray-400 text-xs">Room: {roomId}</p>}</div>
                <button onClick={handleLeaveGame} className="bg-gray-700 hover:bg-gray-600 font-bold py-1.5 px-3 sm:py-2 sm:px-4 rounded-lg text-xs sm:text-base">Leave</button>
            </header>
            
            <main className="flex-grow flex flex-col justify-center overflow-y-auto">
                <div className="bg-gray-800/50 border border-gray-700 rounded-2xl p-4 sm:p-6">
                    <div className="flex gap-2 mb-2 flex-wrap"><span className="text-xs sm:text-sm bg-blue-500/20 text-blue-300 px-3 py-1 rounded-full" dangerouslySetInnerHTML={{ __html: currentQuestion.category }}></span><span className="text-xs sm:text-sm bg-yellow-500/20 text-yellow-300 px-3 py-1 rounded-full capitalize" dangerouslySetInnerHTML={{ __html: currentQuestion.difficulty }}></span></div>
                    <h2 className="text-lg sm:text-2xl font-bold mb-4" dangerouslySetInnerHTML={{ __html: currentQuestion.question }}></h2>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2 sm:gap-4">{currentQuestion.answers.map((answer, index) => (<button key={index} onClick={() => handleAnswerSelect(answer)} disabled={isAnswered} className={`w-full p-3 sm:p-4 rounded-xl border-2 font-semibold text-left transition-all duration-300 text-sm sm:text-base ${getAnswerClass(answer)}`}><span dangerouslySetInnerHTML={{ __html: answer }}></span></button>))}</div>
                </div>
            </main>
            
            <footer className="flex-shrink-0 mt-2 sm:mt-4">
                {allPlayersAnswered && (
                     <div className="text-center mb-2 p-2 sm:p-3 rounded-lg bg-gray-800 border border-gray-700">
                        {selectedAnswer === currentQuestion.correctAnswer ? <p className="text-lg sm:text-xl font-bold text-green-400 flex items-center justify-center gap-2"><CheckCircle size={20} /> Correct!</p> : <p className="text-lg sm:text-xl font-bold text-red-400 flex items-center justify-center gap-2"><XCircle size={20}/> Incorrect!</p>}
                        {selectedAnswer !== currentQuestion.correctAnswer && <p className="text-gray-300 mt-1 text-sm sm:text-base">Correct answer: <span className="font-bold text-green-400" dangerouslySetInnerHTML={{__html: currentQuestion.correctAnswer}}></span></p>}
                     </div>
                )}
                {gameMode === 'multiplayer' && (<div className="bg-gray-800/50 border border-gray-700 rounded-xl p-2 mb-2 text-xs"><h4 className="text-white text-center font-bold mb-1">Players</h4><div className="flex flex-wrap justify-center gap-x-2 gap-y-1">{gameData.players.map(p => (<div key={p.uid} className={`flex items-center gap-1 p-1 rounded-lg transition-all ${gameData.answers && gameData.answers[p.uid] !== undefined ? 'bg-green-500/20' : 'bg-gray-700/50'}`}><span className="text-white">{p.name}</span><span className="text-gray-300 font-mono">({p.score})</span>{gameData.answers && gameData.answers[p.uid] !== undefined && <CheckCircle size={14} className="text-green-400"/>}</div>))}</div></div>)}
                {(allPlayersAnswered) && (isHost) && (<button onClick={handleNextQuestion} className="w-full bg-gradient-to-r from-purple-600 to-blue-500 text-white font-bold py-3 px-5 rounded-xl text-lg transition-transform transform hover:scale-105">{gameData.currentQuestionIndex >= gameData.questions.length - 1 ? 'Finish Game' : 'Next Question'}</button>)}
            </footer>
        </div>
    );
};

const WinnerDisplay = ({ players }) => {
    // This component is now much cleaner and less prone to errors.
    return (
        <div className="text-white">
            <div className="flex justify-center items-end gap-2 sm:gap-4 mb-6">
                {players.slice(0, 3).map((player, index) => {
                    const orderClass = index === 0 ? 'order-2' : (index === 1 ? 'order-1' : 'order-3');
                    const crownClasses = [
                        'text-yellow-400 h-10 w-10', // 1st place
                        'text-gray-300 h-8 w-8',   // 2nd place
                        'text-yellow-600 h-8 w-8'    // 3rd place
                    ];
                    const podiumBgClasses = [
                        'bg-yellow-500', 
                        'bg-gray-400',   
                        'bg-yellow-700'  
                    ];
                     const podiumBoxClasses = [
                        'bg-yellow-600 h-24', 
                        'bg-gray-500 h-20',   
                        'bg-yellow-800 h-16'  
                    ];

                    return (
                        <div key={player.uid} className={`flex flex-col items-center ${orderClass}`}>
                            <Crown className={crownClasses[index]} />
                            <div className={`p-3 rounded-t-lg ${podiumBgClasses[index]}`}>
                                <User size={32}/>
                            </div>
                            <div className={`text-center font-bold px-2 py-1 rounded-b-lg w-full flex items-center justify-center ${podiumBoxClasses[index]}`}>
                                <div>
                                    <p className="text-base sm:text-lg">{player.name}</p>
                                    <p className="text-lg sm:text-xl">{player.score}</p>
                                </div>
                            </div>
                        </div>
                    );
                })}
            </div>
            <h3 className="text-lg font-bold text-center mb-2">Final Scores</h3>
            <div className="space-y-2 max-h-40 overflow-y-auto">
                {players.map((player, index) => (
                    <div key={player.uid} className="bg-gray-700 p-2 rounded-lg flex justify-between items-center text-sm">
                        <span className="font-semibold">{index + 1}. {player.name}</span>
                        <span className="font-mono">{player.score} points</span>
                    </div>
                ))}
            </div>
        </div>
    );
};


export default function App() {
    const [view, setView] = useState('loading');
    const [gameMode, setGameMode] = useState('single');
    const [playerName, setPlayerName] = useState('');
    const [roomId, setRoomId] = useState(null);
    const [userId, setUserId] = useState(null);
    const [isAuthReady, setIsAuthReady] = useState(false);
    const [error, setError] = useState(null);
    const [directJoinRoomId, setDirectJoinRoomId] = useState(null);
    const [gameSettings, setGameSettings] = useState({ amount: 10, category: '', difficulty: '' });

    // --- Hooks ---
    useEffect(() => {
        const urlParams = new URLSearchParams(window.location.search);
        const roomCodeFromUrl = urlParams.get('room');
        if (roomCodeFromUrl) {
            setDirectJoinRoomId(roomCodeFromUrl.toUpperCase());
            setGameMode('multiplayer');
        }
    }, []);

    useEffect(() => {
        if (!auth) { 
            console.log("Firebase not ready, waiting...");
            return;
        }
        const unsubscribe = onAuthStateChanged(auth, async (user) => {
            if (user) {
                setUserId(user.uid);
            } else {
                try {
                    if (initialAuthToken) await signInWithCustomToken(auth, initialAuthToken);
                    else await signInAnonymously(auth);
                } catch (authError) {
                    console.error("Authentication failed:", authError);
                    setError("Authentication failed.");
                    setView('error');
                }
            }
            if(!isAuthReady) setIsAuthReady(true);
        });
        return () => unsubscribe();
    }, [isAuthReady]);

    useEffect(() => {
        if (isAuthReady) {
            if (directJoinRoomId) {
                setView('settings'); // If joining via link, also show settings
            } else {
                setView('mainMenu'); // Otherwise, show main menu
            }
        }
    }, [isAuthReady, directJoinRoomId]);

    const handleJoinRoom = useCallback(async (code, pName, errorHandler = setError) => {
        const roomCode = code.trim().toUpperCase();
        if (!roomCode || !db) return;
        const roomDocRef = doc(db, `artifacts/${appId}/public/data/rooms/${roomCode}`);
        try {
            const roomDoc = await getDoc(roomDocRef);
            if (roomDoc.exists()) {
                const roomData = roomDoc.data();
                if (!roomData.players.some(p => p.uid === userId)) {
                     await updateDoc(roomDocRef, {
                        players: arrayUnion({ uid: userId, name: pName, score: 0 })
                    });
                }
                setRoomId(roomCode);
                setView('lobby');
            } else {
                errorHandler('Room not found. Check the code and try again.');
            }
        } catch (e) {
            console.error("Error joining room: ", e);
            errorHandler('Could not join room. Please try again.');
        }
    }, [userId]);


    const renderView = () => {
        if (!auth || (view !== 'loading' && !firebaseConfig.apiKey)) {
            return <div className="text-white text-center p-8">
                <h2 className="text-2xl font-bold text-red-400">Firebase Not Configured</h2>
                <p className="mt-4 text-gray-300">This app requires Firebase to function. If you are the developer, please make sure to set up your Firebase project and add the configuration keys to your Vercel environment variables.</p>
            </div>
        }
        if (view === 'error') return <div className="text-red-400 text-center">{error}</div>;
        if (view === 'loading' || !isAuthReady) return <LoadingSpinner />;

        switch (view) {
            case 'mainMenu':
                return <MainMenu setView={setView} setGameMode={setGameMode} />;
            case 'settings':
                return <SettingsScreen setView={setView} setGameSettings={setGameSettings} gameMode={gameMode}/>;
            case 'enterName':
                return <EnterName setView={setView} setPlayerName={setPlayerName} gameMode={gameMode} playerName={playerName} directJoinRoomId={directJoinRoomId} handleJoinRoom={handleJoinRoom} />;
            case 'multiplayerMenu':
                return <MultiplayerMenu setView={setView} setRoomId={setRoomId} userId={userId} playerName={playerName} handleJoinRoom={handleJoinRoom} gameSettings={gameSettings} />;
            case 'lobby':
                return <Lobby setView={setView} roomId={roomId} userId={userId} />;
            case 'game':
                return <Game gameMode={gameMode} roomId={roomId} userId={userId} setView={setView} playerName={playerName} gameSettings={gameSettings} />;
            default:
                return <MainMenu setView={setView} setGameMode={setGameMode} />;
        }
    };

    return (
        <div className="bg-gray-900 text-white font-sans w-full h-screen overflow-y-auto">
             <div className="container mx-auto h-full flex flex-col items-center justify-center">
                {renderView()}
             </div>
        </div>
    );
}
