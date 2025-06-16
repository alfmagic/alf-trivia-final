import React, { useState, useEffect, useCallback, useRef } from 'react';
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, onAuthStateChanged, signInWithCustomToken } from 'firebase/auth';
import { getFirestore, doc, setDoc, getDoc, onSnapshot, updateDoc, arrayUnion, collection, deleteDoc, query, orderBy, limit, getDocs, addDoc } from 'firebase/firestore';
import { Sparkles, Users, Gamepad2, Settings, Copy, Share2, Play, ChevronLeft, Crown, User, ArrowRight, LogOut, CheckCircle, XCircle, Link as LinkIcon, SlidersHorizontal, Trophy, CheckSquare, Square } from 'lucide-react';

// --- FIREBASE CONFIGURATION ---
// This configuration will work in the interactive environment.
const firebaseConfig = JSON.parse(import.meta.env.VITE_FIREBASE_CONFIG || '{}');
const initialAuthToken = typeof __initial_auth_token !== 'undefined' ? __initial_auth_token : null;
const appId = typeof __app_id !== 'undefined' ? __app_id : 'default-trivia-app';

// --- FIREBASE INITIALIZATION ---
let app;
let auth;
let db;

if (firebaseConfig.apiKey && firebaseConfig.projectId) {
    try {
        app = initializeApp(firebaseConfig);
        auth = getAuth(app);
        db = getFirestore(app);
    } catch (error) {
        console.error("Firebase initialization failed:", error);
    }
} else {
    console.warn("Firebase configuration is missing. App will run in a limited mode.");
}

// --- HELPER FUNCTIONS ---
const generateRoomCode = () => Math.random().toString(36).substring(2, 8).toUpperCase();
const generateRandomName = () => {
    const adjectives = ["Clever", "Swift", "Witty", "Curious", "Brave", "Silent", "Daring", "Happy", "Lucky"];
    const animals = [
        { name: "Fox", emoji: "🦊" }, { name: "Jaguar", emoji: "🐆" }, { name: "Panda", emoji: "🐼" },
        { name: "Raptor", emoji: "🦖" }, { name: "Lion", emoji: "🦁" }, { name: "Owl", emoji: "🦉" },
        { name: "Wolf", emoji: "🐺" }, { name: "Monkey", emoji: "🐵" }, { name: "Eagle", emoji: "🦅" }
    ];
    const adjective = adjectives[Math.floor(Math.random() * adjectives.length)];
    const animal = animals[Math.floor(Math.random() * animals.length)];
    return `${adjective} ${animal.name} ${animal.emoji}`;
};
const shuffleArray = (array) => [...array].sort(() => Math.random() - 0.5);

// --- API & DATA HOOKS ---
const useTriviaAPI = () => {
    const fetchCategories = useCallback(async () => {
        try {
            const response = await fetch('https://opentdb.com/api_category.php');
            const data = await response.json();
            const categoryMap = {
                'General Knowledge': { id: 'General Knowledge', subcategories: [] }, 'Entertainment': { id: 'Entertainment', subcategories: [] },
                'Science': { id: 'Science', subcategories: [] }, 'History': { id: 'History', subcategories: [] },
                'Geography': { id: 'Geography', subcategories: [] }, 'Sports': { id: 'Sports', subcategories: [] },
                'Other': { id: 'Other', subcategories: [] },
            };
            data.trivia_categories.forEach(cat => {
                const mainName = cat.name.split(':')[0];
                if (categoryMap[mainName]) categoryMap[mainName].subcategories.push(cat);
                else if (cat.name.includes('Science')) categoryMap['Science'].subcategories.push(cat);
                else categoryMap['Other'].subcategories.push(cat);
            });
            return Object.values(categoryMap).filter(group => group.subcategories.length > 0);
        } catch (error) { console.error('Failed to fetch categories:', error); return []; }
    }, []);

    const fetchQuestions = useCallback(async ({ amount = 10, categories = [], difficulty = '' }) => {
        const fetchUrl = (catId = '', num = amount) => `https://opentdb.com/api.php?amount=${num}&type=multiple${catId ? `&category=${catId}` : ''}${difficulty ? `&difficulty=${difficulty}` : ''}`;
        let allQuestions = [];
        
        if (categories.length > 0) {
            const questionsPerCategory = Math.max(1, Math.ceil(amount / categories.length));
            const promises = categories.map(catId => fetch(fetchUrl(catId, questionsPerCategory)).then(res => res.json()));
            try {
                const results = await Promise.all(promises);
                allQuestions = results.flatMap(result => result.results || []);
            } catch (error) { console.warn("Fetching from multiple categories failed, falling back."); }
        }

        if (allQuestions.length < amount) {
            const needed = amount - allQuestions.length;
            try {
                const response = await fetch(fetchUrl('', needed > 0 ? needed : amount));
                const data = await response.json();
                if (data.results) allQuestions.push(...data.results);
            } catch (error) { console.error("Fallback fetch failed", error); }
        }
        
        return shuffleArray(allQuestions).slice(0, amount).map(q => ({ ...q, answers: shuffleArray([q.correct_answer, ...q.incorrect_answers]) }));
    }, []);

    return { fetchCategories, fetchQuestions };
};

// --- UI COMPONENTS ---
const LoadingSpinner = ({ text = "Loading..."}) => ( <div className="flex flex-col justify-center items-center h-full text-center"><div className="animate-spin rounded-full h-16 w-16 border-t-4 border-b-4 border-purple-500"></div><p className="mt-4 text-white">{text}</p></div> );
const CustomModal = ({ title, children, onClose }) => ( <div className="fixed inset-0 bg-black bg-opacity-75 flex justify-center items-center z-50 p-4"><div className="bg-gray-800 border border-gray-700 rounded-2xl shadow-lg p-6 sm:p-8 w-full max-w-md text-white text-center"><h2 className="text-2xl font-bold mb-6">{title}</h2><div>{children}</div><button onClick={onClose} className="mt-8 w-full bg-purple-600 hover:bg-purple-700 text-white font-bold py-3 px-4 rounded-lg">Close</button></div></div> );

const MainMenu = ({ setView, setGameMode }) => (
    <div className="w-full max-w-md mx-auto p-4 flex flex-col items-center justify-center h-full text-center">
        <div className="mb-10"><Gamepad2 className="mx-auto h-16 w-16 text-purple-400" /><h1 className="text-5xl font-bold text-white mt-4">Trivia Questions</h1><p className="text-gray-400 mt-2">made by Alf</p></div>
        <div className="w-full space-y-4">
            <button onClick={() => { setGameMode('single'); setView('settings'); }} className="w-full bg-gradient-to-r from-purple-600 to-blue-500 text-white font-bold py-4 px-6 rounded-xl text-lg flex items-center justify-center gap-3"><User /> Single Player</button>
            <button onClick={() => { setGameMode('multiplayer'); setView('settings'); }} className="w-full bg-gradient-to-r from-green-500 to-teal-400 text-white font-bold py-4 px-6 rounded-xl text-lg flex items-center justify-center gap-3"><Users /> Multiplayer</button>
        </div>
    </div>
);

const SettingsScreen = ({ setView, setGameSettings, gameMode, directJoinRoomId }) => {
    const [groupedCategories, setGroupedCategories] = useState([]);
    const [loading, setLoading] = useState(true);
    const [settings, setSettings] = useState({ amount: 10, categories: [], difficulty: '' });
    const { fetchCategories } = useTriviaAPI();

    useEffect(() => { const load = async () => { setGroupedCategories(await fetchCategories()); setLoading(false); }; load(); }, [fetchCategories]);
    const handleCategoryToggle = (catId) => setSettings(p => ({ ...p, categories: p.categories.includes(catId) ? p.categories.filter(id => id !== catId) : [...p.categories, catId] }));
    const handleSelectAll = () => { const allIds = groupedCategories.flatMap(g => g.subcategories.map(s => s.id)); setSettings(p => ({ ...p, categories: p.categories.length === allIds.length ? [] : allIds })); };
    const handleContinue = () => { setGameSettings(settings); setView(gameMode === 'multiplayer' && !directJoinRoomId ? 'multiplayerMenu' : 'enterName'); };
    const sliderStyle = { background: `linear-gradient(to right, #8b5cf6 0%, #8b5cf6 ${(settings.amount - 5) / (20-5) * 100}%, #4b5563 ${(settings.amount - 5) / (20-5) * 100}%, #4b5563 100%)` };

    if (loading) return <LoadingSpinner text="Fetching categories..."/>;

    return (
        <div className="w-full max-w-lg mx-auto p-4 flex flex-col justify-center h-full">
            <div className="text-center mb-6"><SlidersHorizontal className="mx-auto h-12 w-12 text-purple-400" /><h1 className="text-4xl font-bold text-white mt-4">Game Settings</h1></div>
            <div className="space-y-6 bg-gray-800/50 p-6 rounded-2xl">
                <div>
                    <label htmlFor="amount" className="block text-lg font-medium text-white mb-2">Number of Questions: <span className="font-bold text-purple-400">{settings.amount}</span></label>
                    <input type="range" id="amount" min="5" max="20" step="1" value={settings.amount} onChange={e => setSettings({...settings, amount: Number(e.target.value)})} className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer" style={sliderStyle}/>
                </div>
                <div>
                    <label className="block text-lg font-medium text-white mb-2">Difficulty</label>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                        {['', 'easy', 'medium', 'hard'].map(diff => ( <button key={diff} onClick={() => setSettings({...settings, difficulty: diff})} className={`py-2 px-3 rounded-lg capitalize text-sm font-bold transition-colors ${settings.difficulty === diff ? 'bg-purple-600 text-white ring-2 ring-purple-400' : 'bg-gray-700 hover:bg-gray-600 text-gray-300'}`}>{diff || 'Any'}</button>))}
                    </div>
                </div>
                <div>
                    <div className="flex justify-between items-center mb-2">
                        <label className="block text-lg font-medium text-white">Categories</label>
                        <button onClick={handleSelectAll} className="text-xs font-bold text-purple-400 hover:text-purple-300">{settings.categories.length === groupedCategories.flatMap(g => g.subcategories.map(s => s.id)).length ? 'Deselect All' : 'Select All'}</button>
                    </div>
                    <div className="space-y-2 max-h-40 overflow-y-auto p-2 bg-gray-900/50 rounded-lg">
                        {groupedCategories.map(group => (
                            <details key={group.id} className="bg-gray-700/50 rounded-lg" open>
                                <summary className="p-2 cursor-pointer font-bold text-white list-none flex justify-between items-center">{group.id}<ChevronLeft className="transform transition-transform -rotate-90 open:rotate-0" /></summary>
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 p-2 border-t border-gray-600">
                                    {group.subcategories.map(cat => ( <button key={cat.id} onClick={() => handleCategoryToggle(cat.id)} className={`py-2 px-3 text-left rounded-lg text-xs font-bold transition-colors flex items-center gap-2 ${settings.categories.includes(cat.id) ? 'bg-purple-600 text-white' : 'bg-gray-600 hover:bg-gray-500 text-gray-300'}`}>{settings.categories.includes(cat.id) ? <CheckSquare size={14}/> : <Square size={14}/>}{cat.name.replace(`${group.id}: `, '')}</button>))}
                                </div>
                            </details>
                        ))}
                    </div>
                </div>
            </div>
            <div className="mt-8 flex gap-4">
                <button onClick={() => setView('mainMenu')} className="w-full bg-gray-600 hover:bg-gray-700 text-white font-bold py-3 px-4 rounded-lg"><ChevronLeft className="inline-block mr-1" size={20}/> Back</button>
                <button onClick={handleContinue} className="w-full bg-gradient-to-r from-purple-600 to-blue-500 text-white font-bold py-3 px-4 rounded-lg">Continue <ArrowRight className="inline-block ml-1" size={20}/></button>
            </div>
        </div>
    );
};

const EnterName = ({ setView, setPlayerName, gameMode, playerName, directJoinRoomId, handleJoinRoom }) => {
    const [name, setName] = useState(playerName);
    const handleSubmit = (e) => { e.preventDefault(); let finalName = name.trim(); if (!finalName) finalName = generateRandomName(); setPlayerName(finalName); if (directJoinRoomId) handleJoinRoom(directJoinRoomId, finalName); else if (gameMode === 'single') setView('game'); else setView('multiplayerMenu'); };
    return (
        <div className="w-full max-w-md mx-auto p-4 flex flex-col items-center justify-center h-full">
            <div className="text-center mb-10"><Users className="mx-auto h-12 w-12 text-purple-400" /><h1 className="text-4xl font-bold text-white mt-4">{directJoinRoomId ? "Joining Game" : "Enter Your Name"}</h1><p className="text-gray-400 mt-2">Enter your name or continue with a random one.</p></div>
            <form onSubmit={handleSubmit} className="w-full space-y-6">
                <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder={generateRandomName()} className="w-full bg-gray-700 text-white placeholder-gray-400 border-2 border-gray-600 rounded-lg py-3 px-4 text-center text-lg focus:outline-none focus:border-purple-500"/>
                <div className="flex gap-4">
                    <button type="button" onClick={() => setView('settings')} className="w-full bg-gray-600 hover:bg-gray-700 text-white font-bold py-3 px-4 rounded-lg"><ChevronLeft className="inline-block mr-1" size={20}/> Back</button>
                    <button type="submit" className="w-full bg-gradient-to-r from-purple-600 to-blue-500 text-white font-bold py-3 px-4 rounded-lg">Continue <ArrowRight className="inline-block ml-1" size={20}/></button>
                </div>
            </form>
        </div>
    );
};

const MultiplayerMenu = ({ setView, setRoomId, userId, playerName, handleJoinRoom, gameSettings }) => {
    const [joinCode, setJoinCode] = useState('');
    const [error, setError] = useState('');
    const { fetchQuestions } = useTriviaAPI();
    const handleCreateRoom = async () => { const newRoomId = generateRoomCode(); setRoomId(newRoomId); const questions = await fetchQuestions(gameSettings); if (questions.length < gameSettings.amount) { setError('Could not fetch enough questions with these settings. Please try again.'); return; } const roomDocRef = doc(db, `artifacts/${appId}/public/data/rooms/${newRoomId}`); try { await setDoc(roomDocRef, { hostId: userId, players: [{ uid: userId, name: playerName, score: 0 }], questions, gameSettings, currentQuestionIndex: 0, gameState: 'waiting', createdAt: new Date(), answers: {} }); setView('lobby'); } catch (e) { console.error("Error creating room: ", e); setError('Could not create room. Please try again.'); } };
    const onJoinSubmit = async (e) => { e.preventDefault(); if (!joinCode.trim()) return; await handleJoinRoom(joinCode, playerName, setError); };
    return (
        <div className="w-full max-w-md mx-auto p-4 flex flex-col items-center justify-center h-full">
            <div className="text-center mb-10"><Users className="mx-auto h-12 w-12 text-green-400" /><h1 className="text-4xl font-bold text-white mt-4">Multiplayer</h1><p className="text-gray-400 mt-2">Create a room or join a friend's</p></div>
            {error && <p className="text-red-400 bg-red-900/50 p-3 rounded-lg mb-4">{error}</p>}
            <div className="w-full space-y-4">
                <button onClick={handleCreateRoom} className="w-full bg-gradient-to-r from-green-500 to-teal-400 text-white font-bold py-4 px-6 rounded-xl text-lg flex items-center justify-center gap-3">Create Room</button>
                <p className="text-center text-gray-400">OR</p>
                <form onSubmit={onJoinSubmit} className="w-full space-y-4">
                    <input type="text" value={joinCode} onChange={(e) => setJoinCode(e.target.value.toUpperCase())} placeholder="ENTER ROOM CODE" className="w-full bg-gray-700 text-white placeholder-gray-400 border-2 border-gray-600 rounded-lg py-3 px-4 text-center tracking-widest font-mono text-lg focus:outline-none focus:border-pink-500" maxLength="6" />
                    <button type="submit" className="w-full bg-gradient-to-r from-pink-600 to-purple-500 text-white font-bold py-3 px-4 rounded-lg disabled:opacity-50" disabled={!joinCode.trim()}>Join Room</button>
                </form>
            </div>
             <button type="button" onClick={() => setView('settings')} className="mt-8 bg-gray-600 hover:bg-gray-700 text-white font-bold py-3 px-4 rounded-lg"><ChevronLeft className="inline-block mr-1" size={20}/> Back</button>
        </div>
    );
};

const Lobby = ({ setView, roomId, userId }) => {
    const [room, setRoom] = useState(null);
    const [isHost, setIsHost] = useState(false);
    const [copied, setCopied] = useState('');
    const [error, setError] = useState('');

    useEffect(() => {
        if (!roomId || !db) { setView('multiplayerMenu'); return; }
        const roomDocRef = doc(db, `artifacts/${appId}/public/data/rooms/${roomId}`);
        const unsubscribe = onSnapshot(roomDocRef, (doc) => { if (doc.exists()) { const data = doc.data(); setRoom(data); setIsHost(data.hostId === userId); if (data.gameState === 'playing') setView('game'); } else { setError('This room no longer exists.'); setTimeout(() => { setView('multiplayerMenu'); }, 3000); } });
        return () => unsubscribe();
    }, [roomId, userId, setView]);

    const handleStartGame = async () => { const roomDocRef = doc(db, `artifacts/${appId}/public/data/rooms/${roomId}`); try { await updateDoc(roomDocRef, { gameState: 'playing' }); } catch (e) { console.error("Error starting game: ", e); setError('Failed to start the game.'); } };
    const handleLeaveRoom = async () => { if (!room) return; try { const roomDocRef = doc(db, `artifacts/${appId}/public/data/rooms/${roomId}`); const updatedPlayers = room.players.filter(p => p.uid !== userId); if (updatedPlayers.length === 0) { await deleteDoc(roomDocRef); } else { const newHostId = (isHost && updatedPlayers.length > 0) ? updatedPlayers[0].uid : room.hostId; await updateDoc(roomDocRef, { players: updatedPlayers, hostId: newHostId }); } setView('mainMenu'); } catch (e) { console.error("Error leaving room: ", e); setError('Could not leave the room.'); } };
    const copyToClipboard = (text, type) => { const textArea = document.createElement('textarea'); textArea.value = text; document.body.appendChild(textArea); textArea.select(); try { document.execCommand('copy'); setCopied(type); setTimeout(() => setCopied(''), 2000); } catch (err) { console.error('Failed to copy: ', err); } document.body.removeChild(textArea); };

    if (error) return <div className="w-full max-w-md mx-auto p-4 flex flex-col items-center justify-center h-full text-white"><XCircle className="h-16 w-16 text-red-500 mb-4" /><h2 className="text-2xl font-bold">{error}</h2><p className="text-gray-400">Redirecting you...</p></div>
    if (!room) return <LoadingSpinner />;
    const shareLink = `${window.location.origin}${window.location.pathname}?room=${roomId}`;

    return (
        <div className="w-full max-w-lg mx-auto p-4 flex flex-col items-center justify-center h-full">
             <div className="w-full text-center mb-6"><div className="w-20 h-20 mx-auto rounded-full bg-purple-500/20 flex items-center justify-center mb-4"><div className="w-16 h-16 rounded-full bg-purple-500/30 flex items-center justify-center animate-pulse"><Users className="h-8 w-8 text-purple-300"/></div></div><h1 className="text-2xl font-bold text-white">{isHost ? "You are the host!" : "Waiting for host to start..."}</h1><p className="text-gray-400 mt-1">Share the room code or link with your friends!</p></div>
            <div className="bg-gray-800/50 border border-gray-700 p-3 rounded-xl flex items-center justify-center gap-2 mb-2"><span className="text-gray-300">Code:</span><span className="text-2xl font-bold text-white tracking-widest font-mono">{roomId}</span><button onClick={() => copyToClipboard(roomId, 'code')} className="bg-gray-700 hover:bg-gray-600 text-white p-2 rounded-lg"><Copy size={18} /></button></div>
            <div className="bg-gray-800/50 border border-gray-700 p-3 rounded-xl flex items-center justify-center gap-2 mb-6"><span className="text-gray-300">Link:</span><button onClick={() => copyToClipboard(shareLink, 'link')} className="bg-gray-700 hover:bg-gray-600 text-white p-2 rounded-lg flex items-center gap-2"><LinkIcon size={18} /> Copy Invite Link</button></div>
            <p className="text-sm text-green-400 mb-6 h-5 transition-opacity">{copied ? `Copied ${copied} to clipboard!` : ''}</p>
            <div className="w-full bg-gray-800/50 border border-gray-700 rounded-xl p-6 mb-8"><h3 className="text-white font-bold text-lg mb-4 text-center">Players in room ({room.players.length})</h3><div className="space-y-3 max-h-48 overflow-y-auto">{room.players.map(player => (<div key={player.uid} className="bg-gray-700/50 p-3 rounded-lg flex items-center justify-between"><span className="text-white font-semibold">{player.name}</span>{player.uid === room.hostId && <Crown size={20} className="text-yellow-400" />}</div>))}</div></div>
            <div className="w-full flex flex-col space-y-3">
                {isHost && (<button onClick={handleStartGame} disabled={room.players.length < 1} className="w-full bg-gradient-to-r from-green-500 to-teal-400 text-white font-bold py-4 rounded-xl text-lg flex items-center justify-center gap-3 disabled:opacity-50 disabled:grayscale"><Play /> Start Game</button>)}
                 <button onClick={handleLeaveRoom} className="w-full bg-gray-600 hover:bg-gray-700 text-white font-bold py-3 px-4 rounded-lg"><LogOut className="inline-block mr-2" size={20}/> Leave Room</button>
            </div>
        </div>
    );
};

const Game = ({ gameMode, roomId, userId, setView, playerName, gameSettings, setHighScores }) => {
    const [gameData, setGameData] = useState(null);
    const [selectedAnswer, setSelectedAnswer] = useState(null);
    const [isAnswered, setIsAnswered] = useState(false);
    const { fetchQuestions } = useTriviaAPI();
    const [modalContent, setModalContent] = useState(null);
    const gameContainerRef = useRef(null);
    
    // This effect locks the screen height to prevent layout shifts on mobile
    useEffect(() => {
        if (gameContainerRef.current) {
            gameContainerRef.current.style.height = `${window.innerHeight}px`;
        }
    }, []);

    useEffect(() => {
        const setupGame = async () => {
            if (gameMode === 'multiplayer') {
                if (!roomId || !db) return;
                const roomDocRef = doc(db, `artifacts/${appId}/public/data/rooms/${roomId}`);
                return onSnapshot(roomDocRef, (doc) => {
                    if (doc.exists()) {
                        const data = doc.data();
                        setGameData(data);
                        const myAnswer = data.answers ? data.answers[userId] : undefined;
                        setIsAnswered(myAnswer !== undefined);
                        if (myAnswer) setSelectedAnswer(myAnswer);
                        if(data.gameState === 'finished') setModalContent({ title: "Game Over!", body: <WinnerDisplay players={data.players} gameMode="multiplayer" /> });
                    } else { setModalContent({ title: "Error", body: <p>The game room was not found. It might have been deleted.</p> }); }
                });
            } else {
                const questions = await fetchQuestions(gameSettings);
                if (questions.length < gameSettings.amount) { setModalContent({ title: "Not Enough Questions", body: <p>The API couldn't provide enough questions for your selected criteria. Please try different settings.</p> }); return; }
                setGameData({ questions, currentQuestionIndex: 0, players: [{ uid: userId, name: playerName, score: 0 }], gameState: 'playing', answers: {} });
            }
        };
        const unsubPromise = setupGame();
        return () => { unsubPromise.then(unsub => unsub && unsub()); };
    }, [gameMode, roomId, userId, playerName, fetchQuestions, gameSettings]);
    
    useEffect(() => {
        const checkAndSubmitHighScore = async () => {
            if (gameMode === 'single' && gameData?.gameState === 'finished' && db) {
                const myPlayer = gameData.players[0];
                if (myPlayer.score > 0) {
                    await addDoc(collection(db, `artifacts/${appId}/public/data/highscores`), { name: myPlayer.name, score: myPlayer.score, createdAt: new Date() });
                }
                const q = query(collection(db, `artifacts/${appId}/public/data/highscores`), orderBy("score", "desc"), limit(10));
                const querySnapshot = await getDocs(q);
                const scores = querySnapshot.docs.map(doc => ({id: doc.id, ...doc.data()}));
                setHighScores(scores);
                setModalContent({ title: "Game Over!", body: <WinnerDisplay players={gameData.players} gameMode="single" highScores={scores} /> });
            }
        };
        checkAndSubmitHighScore();
    }, [gameData?.gameState, gameData?.players, gameMode, setHighScores, userId]);

    const handleAnswerSelect = async (answer) => {
        if (isAnswered) return;
        setSelectedAnswer(answer);
        setIsAnswered(true);
        const currentQuestion = gameData.questions[gameData.currentQuestionIndex];
        const isCorrect = answer === currentQuestion.correct_answer;
        
        if (isCorrect) {
            const playerIndex = gameData.players.findIndex(p => p.uid === userId);
            const updatedPlayers = [...gameData.players];
            if (playerIndex !== -1) updatedPlayers[playerIndex].score += 1;
            
            if (gameMode === 'multiplayer') {
                const roomDocRef = doc(db, `artifacts/${appId}/public/data/rooms/${roomId}`);
                await updateDoc(roomDocRef, { players: updatedPlayers, [`answers.${userId}`]: answer });
            } else {
                setGameData(prev => ({ ...prev, players: updatedPlayers }));
            }
        } else if (gameMode === 'multiplayer') {
             const roomDocRef = doc(db, `artifacts/${appId}/public/data/rooms/${roomId}`);
             await updateDoc(roomDocRef, { [`answers.${userId}`]: answer });
        }
    };
    
    const handleNextQuestion = async () => {
        const nextIndex = gameData.currentQuestionIndex + 1;
        const isGameOver = nextIndex >= gameData.questions.length;

        if (gameMode === 'multiplayer') {
            if (gameData.hostId !== userId) return;
            const roomDocRef = doc(db, `artifacts/${appId}/public/data/rooms/${roomId}`);
            await updateDoc(roomDocRef, isGameOver ? { gameState: 'finished' } : { currentQuestionIndex: nextIndex, answers: {} });
        } else {
            setIsAnswered(false);
            setSelectedAnswer(null);
            if (isGameOver) setGameData(prev => ({...prev, gameState: 'finished' }));
            else setGameData(prev => ({ ...prev, currentQuestionIndex: nextIndex }));
        }
    };
    
    if (!gameData || !gameData.questions || gameData.questions.length === 0) return <LoadingSpinner text="Fetching questions..."/>;
    
    const currentQuestion = gameData.questions[gameData.currentQuestionIndex];
    const myPlayer = gameData.players.find(p => p.uid === userId) || gameData.players[0];
    const isHost = gameMode === 'multiplayer' ? gameData.hostId === userId : true;
    const allPlayersAnswered = gameMode === 'multiplayer' ? gameData.players.length === Object.keys(gameData.answers || {}).length : isAnswered;

    const getAnswerClass = (answer) => {
        if (!isAnswered) return 'bg-gray-700 hover:bg-gray-600 border-gray-600';
        const isCorrect = answer === currentQuestion.correct_answer;
        if(isCorrect) return 'bg-green-500/50 border-green-500 ring-2 ring-green-400';
        if (answer === selectedAnswer && !isCorrect) return 'bg-red-500/50 border-red-500';
        return 'bg-gray-800 border-gray-700 opacity-60';
    };
    
    return (
        <div ref={gameContainerRef} className="w-full max-w-4xl mx-auto p-2 sm:p-4 grid grid-rows-[auto_1fr_auto] text-white">
            {modalContent && <CustomModal title={modalContent.title} onClose={() => { setModalContent(null); setView('mainMenu'); }}>{modalContent.body}</CustomModal>}
            <header className="flex-shrink-0 flex justify-between items-center py-2">
                <span className="bg-purple-500/20 text-purple-300 font-bold px-3 py-1.5 sm:px-4 sm:py-2 rounded-lg text-xs sm:text-base">Question #{gameData.currentQuestionIndex + 1}</span>
                <div className="text-center">
                    <p className="font-bold text-lg sm:text-xl">{myPlayer.name}: {myPlayer.score}</p>
                    {gameMode === 'multiplayer' && <p className="text-gray-400 text-xs">Room: {roomId}</p>}
                </div>
                <button onClick={() => setView('mainMenu')} className="bg-gray-700 hover:bg-gray-600 font-bold py-1.5 px-3 sm:py-2 sm:px-4 rounded-lg text-xs sm:text-base">Leave</button>
            </header>
            
            <main className="overflow-y-auto py-2">
                <div className="bg-gray-800/50 border border-gray-700 rounded-2xl p-4 sm:p-6 flex flex-col h-full">
                    <div className="flex-shrink-0">
                      <div className="flex gap-2 mb-2 flex-wrap"><span className="text-xs sm:text-sm bg-blue-500/20 text-blue-300 px-3 py-1 rounded-full" dangerouslySetInnerHTML={{ __html: currentQuestion.category }}></span><span className="text-xs sm:text-sm bg-yellow-500/20 text-yellow-300 px-3 py-1 rounded-full capitalize" dangerouslySetInnerHTML={{ __html: currentQuestion.difficulty }}></span></div>
                      <h2 className="text-lg sm:text-2xl font-bold mb-4" dangerouslySetInnerHTML={{ __html: currentQuestion.question }}></h2>
                    </div>
                    <div className="flex-grow grid grid-cols-1 md:grid-cols-2 gap-2 sm:gap-4 content-center">
                        {currentQuestion.answers.map((answer, index) => (<button key={index} onClick={() => handleAnswerSelect(answer)} disabled={isAnswered} className={`w-full p-3 sm:p-4 rounded-xl border-2 font-semibold text-left transition-all duration-300 text-sm sm:text-base ${getAnswerClass(answer)}`}><span dangerouslySetInnerHTML={{ __html: answer }}></span></button>))}
                    </div>
                </div>
            </main>
            
            <footer className="py-2">
                 {gameMode === 'multiplayer' && gameData?.players.length > 1 && (
                    <div className="bg-gray-800/50 border border-gray-700 rounded-xl p-2 mb-2 text-xs">
                        <h4 className="text-white text-center font-bold mb-1">Players</h4>
                        <div className="flex flex-wrap justify-center gap-x-2 gap-y-1">
                            {gameData.players.map(p => (
                                <div key={p.uid} className={`flex items-center gap-1 p-1 rounded-lg transition-all ${gameData.answers && gameData.answers[p.uid] !== undefined ? 'bg-green-500/20' : 'bg-gray-700/50'}`}>
                                    <span className="text-white">{p.name}</span>
                                    <span className="text-gray-300 font-mono">({p.score})</span>
                                    {gameData.answers && gameData.answers[p.uid] !== undefined && <CheckCircle size={14} className="text-green-400"/>}
                                </div>
                            ))}
                        </div>
                    </div>
                )}
                <div className="w-full min-h-[58px] flex items-center justify-center">
                     <button
                        onClick={handleNextQuestion}
                        disabled={!((allPlayersAnswered) && (isHost || gameMode === 'single'))}
                        className={`w-full bg-gradient-to-r from-purple-600 to-blue-500 text-white font-bold py-3 px-5 rounded-xl text-lg transition-opacity duration-300 ${
                            (allPlayersAnswered) && (isHost || gameMode === 'single')
                                ? 'opacity-100'
                                : 'opacity-0'
                        }`}
                    >
                        {gameData.currentQuestionIndex >= gameData.questions.length - 1 ? 'Finish Game' : 'Next Question'}
                    </button>
                </div>
            </footer>
        </div>
    );
};


const WinnerDisplay = ({ players, gameMode, highScores = [] }) => {
    if (gameMode === 'single') {
        const myScore = players[0]?.score ?? 0;
        return (
             <div className="text-white w-full">
                 <h3 className="text-xl font-bold text-center mb-2">Your Final Score</h3>
                 <p className="text-5xl font-bold text-purple-400 text-center mb-6">{myScore}</p>
                  <h3 className="text-lg font-bold text-center mb-2">High Scores</h3>
                  <div className="space-y-2 max-h-48 overflow-y-auto">
                       {highScores.length > 0 ? highScores.map((score, index) => (
                           <div key={score.id} className="bg-gray-700 p-2 rounded-lg flex justify-between items-center text-sm">
                               <span className="font-semibold flex items-center gap-2">
                                   {index < 3 && <Trophy size={16} className={index === 0 ? 'text-yellow-400' : index === 1 ? 'text-gray-300' : 'text-yellow-600'} />}
                                   {index + 1}. {score.name}
                               </span>
                               <span className="font-mono">{score.score} points</span>
                           </div>
                       )) : <div className="text-gray-400"><LoadingSpinner text="Loading scores..."/></div>}
                  </div>
             </div>
        )
    }

    const sortedPlayers = [...players].sort((a,b) => b.score - a.score);

    return (
        <div className="text-white">
            <div className="flex justify-center items-end gap-2 sm:gap-4 mb-6">
                {sortedPlayers.slice(0, 3).map((player, index) => {
                    const podiumStyles = [
                        { order: 'order-2', crown: 'text-yellow-400 h-10 w-10', userBg: 'bg-yellow-500', box: 'bg-yellow-600 h-24' },
                        { order: 'order-1', crown: 'text-gray-300 h-8 w-8', userBg: 'bg-gray-400', box: 'bg-gray-500 h-20' },
                        { order: 'order-3', crown: 'text-yellow-600 h-8 w-8', userBg: 'bg-yellow-700', box: 'bg-yellow-800 h-16' }
                    ];
                    const styleIndex = sortedPlayers.length === 2 && index === 1 ? 1 : index;
                    const style = podiumStyles[styleIndex];


                    return (
                        <div key={player.uid} className={`flex flex-col items-center ${style.order}`}>
                            <Crown className={style.crown} />
                            <div className={`p-3 rounded-t-lg ${style.userBg}`}><User size={32}/></div>
                            <div className={`text-center font-bold px-2 py-1 rounded-b-lg w-full flex items-center justify-center ${style.box}`}>
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
                {sortedPlayers.map((player, index) => (
                    <div key={player.uid} className="bg-gray-700 p-2 rounded-lg flex justify-between items-center text-sm">
                        <span className="font-semibold">{index + 1}. {player.name}</span>
                        <span className="font-mono">{player.score} points</span>
                    </div>
                ))}
            </div>
        </div>
    );
};

function App() {
    const [view, setView] = useState('loading');
    const [gameMode, setGameMode] = useState('single');
    const [playerName, setPlayerName] = useState('');
    const [roomId, setRoomId] = useState(null);
    const [userId, setUserId] = useState(null);
    const [isAuthReady, setIsAuthReady] = useState(false);
    const [error, setError] = useState(null);
    const [directJoinRoomId, setDirectJoinRoomId] = useState(null);
    const [gameSettings, setGameSettings] = useState({ amount: 10, categories: [], difficulty: '' });
    const [highScores, setHighScores] = useState([]);

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
            console.error("Firebase Auth is not initialized. Check your configuration.");
            setError("Application could not connect to services.");
            setView('error');
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
                setView('settings');
            } else {
                setView('mainMenu');
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
                if (roomData.gameState === 'playing') {
                     errorHandler('This game has already started.');
                     return;
                }
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
        if (!db) {
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
                return <SettingsScreen setView={setView} setGameSettings={setGameSettings} gameMode={gameMode} directJoinRoomId={directJoinRoomId}/>;
            case 'enterName':
                return <EnterName setView={setView} setPlayerName={setPlayerName} gameMode={gameMode} playerName={playerName} directJoinRoomId={directJoinRoomId} handleJoinRoom={handleJoinRoom} />;
            case 'multiplayerMenu':
                return <MultiplayerMenu setView={setView} setRoomId={setRoomId} userId={userId} playerName={playerName} handleJoinRoom={handleJoinRoom} gameSettings={gameSettings} />;
            case 'lobby':
                return <Lobby setView={setView} roomId={roomId} userId={userId} />;
            case 'game':
                return <Game gameMode={gameMode} roomId={roomId} userId={userId} setView={setView} playerName={playerName} gameSettings={gameSettings} setHighScores={setHighScores} />;
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

export default App;
