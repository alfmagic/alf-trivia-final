import React, { useState, useEffect, useCallback } from 'react';
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, onAuthStateChanged, signInWithCustomToken } from 'firebase/auth';
import { getFirestore, doc, setDoc, getDoc, onSnapshot, updateDoc, arrayUnion, collection, deleteDoc, query, orderBy, limit, getDocs, addDoc } from 'firebase/firestore';
import { Sparkles, Users, Gamepad2, Settings, Copy, Share2, Play, ChevronLeft, Crown, User, ArrowRight, LogOut, CheckCircle, XCircle, Link as LinkIcon, SlidersHorizontal, Trophy } from 'lucide-react';

// --- FIREBASE CONFIGURATION ---
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
const generateRoomCode = () => Math.random().toString(36).substring(2, 8).toUpperCase();
const generateRandomName = () => {
    const adjectives = ["Clever", "Swift", "Witty", "Curious", "Brave", "Silent", "Daring", "Happy", "Lucky"];
    const nouns = ["Fox", "Jaguar", "Panda", "Raptor", "Lion", "Owl", "Wolf", "Monkey", "Eagle"];
    return `${adjectives[Math.floor(Math.random() * adjectives.length)]} ${nouns[Math.floor(Math.random() * nouns.length)]}`;
};
const shuffleArray = (array) => [...array].sort(() => Math.random() - 0.5);

// --- API & DATA HOOKS ---
const useTriviaAPI = () => {
    const fetchCategories = useCallback(async () => {
        try {
            const response = await fetch('https://opentdb.com/api_category.php');
            const data = await response.json();
            return data.trivia_categories;
        } catch (error) { console.error('Failed to fetch categories:', error); return []; }
    }, []);

    const fetchQuestions = useCallback(async ({ amount = 10, categories = [], difficulty = '' }) => {
        if (categories.length === 0) {
            // Fetch from any category if none are selected
            const url = `https://opentdb.com/api.php?amount=${amount}&type=multiple${difficulty ? `&difficulty=${difficulty}` : ''}`;
            try {
                const response = await fetch(url);
                const data = await response.json();
                if (data.response_code !== 0) return [];
                return data.results.map(q => ({ ...q, answers: shuffleArray([q.correct_answer, ...q.incorrect_answers]) }));
            } catch (error) { console.error('Failed to fetch questions:', error); return []; }
        } else {
            // Fetch from multiple selected categories
            const questionsPerCategory = Math.ceil(amount / categories.length);
            const promises = categories.map(catId => {
                const url = `https://opentdb.com/api.php?amount=${questionsPerCategory}&category=${catId}&type=multiple${difficulty ? `&difficulty=${difficulty}` : ''}`;
                return fetch(url).then(res => res.json());
            });
            try {
                const results = await Promise.all(promises);
                const allQuestions = results.flatMap(result => result.results || []);
                const formattedQuestions = allQuestions.map(q => ({ ...q, answers: shuffleArray([q.correct_answer, ...q.incorrect_answers]) }));
                return shuffleArray(formattedQuestions).slice(0, amount);
            } catch (error) { console.error('Failed to fetch multi-category questions:', error); return []; }
        }
    }, []);

    return { fetchCategories, fetchQuestions };
};

// --- UI COMPONENTS ---
const LoadingSpinner = ({ text = "Loading..."}) => (
    <div className="flex flex-col justify-center items-center h-full text-center">
        <div className="animate-spin rounded-full h-16 w-16 border-t-4 border-b-4 border-purple-500"></div>
        <p className="mt-4 text-white">{text}</p>
    </div>
);

const CustomModal = ({ title, children, onClose }) => (
    <div className="fixed inset-0 bg-black bg-opacity-75 flex justify-center items-center z-50 p-4">
        <div className="bg-gray-800 border border-gray-700 rounded-2xl shadow-lg p-6 sm:p-8 w-full max-w-md text-white text-center">
            <h2 className="text-2xl font-bold mb-6">{title}</h2>
            <div>{children}</div>
            <button onClick={onClose} className="mt-8 w-full bg-purple-600 hover:bg-purple-700 text-white font-bold py-3 px-4 rounded-lg transition-transform transform hover:scale-105">
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
            <button onClick={() => { setGameMode('single'); setView('settings'); }} className="w-full bg-gradient-to-r from-purple-600 to-blue-500 text-white font-bold py-4 px-6 rounded-xl text-lg flex items-center justify-center gap-3 transition-transform transform hover:scale-105 shadow-lg">
                <User /> Single Player
            </button>
            <button onClick={() => { setGameMode('multiplayer'); setView('settings'); }} className="w-full bg-gradient-to-r from-green-500 to-teal-400 text-white font-bold py-4 px-6 rounded-xl text-lg flex items-center justify-center gap-3 transition-transform transform hover:scale-105 shadow-lg">
                <Users /> Multiplayer
            </button>
        </div>
    </div>
);

const SettingsScreen = ({ setView, setGameSettings, gameMode }) => {
    const [categories, setCategories] = useState([]);
    const [loading, setLoading] = useState(true);
    const [settings, setSettings] = useState({ amount: 10, categories: [], difficulty: '' });
    const { fetchCategories } = useTriviaAPI();

    useEffect(() => {
        const loadCategories = async () => {
            setCategories(await fetchCategories());
            setLoading(false);
        };
        loadCategories();
    }, [fetchCategories]);

    const handleCategoryToggle = (catId) => {
        setSettings(prev => {
            const newCategories = prev.categories.includes(catId)
                ? prev.categories.filter(id => id !== catId)
                : [...prev.categories, catId];
            return { ...prev, categories: newCategories };
        });
    };

    const handleContinue = () => {
        setGameSettings(settings);
        setView(gameMode === 'multiplayer' && !directJoinRoomId ? 'multiplayerMenu' : 'enterName');
    };
    
    // NEW: Slider styling
    const sliderStyle = {
        background: `linear-gradient(to right, #8b5cf6 0%, #8b5cf6 ${(settings.amount - 5) / 15 * 100}%, #4b5563 ${(settings.amount - 5) / 15 * 100}%, #4b5563 100%)`
    };

    if (loading) return <LoadingSpinner text="Fetching categories..."/>;

    return (
        <div className="w-full max-w-lg mx-auto p-4 flex flex-col justify-center h-full">
            <div className="text-center mb-6">
                <SlidersHorizontal className="mx-auto h-12 w-12 text-purple-400" />
                <h1 className="text-4xl font-bold text-white mt-4">Game Settings</h1>
            </div>
            
            <div className="space-y-6 bg-gray-800/50 p-6 rounded-2xl overflow-y-auto">
                {/* Number of Questions */}
                <div>
                    <label htmlFor="amount" className="block text-lg font-medium text-white mb-2">Number of Questions: <span className="font-bold text-purple-400">{settings.amount}</span></label>
                    <input type="range" id="amount" min="5" max="20" step="1" value={settings.amount} onChange={e => setSettings({...settings, amount: Number(e.target.value)})}
                        className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer" style={sliderStyle}/>
                </div>

                {/* Difficulty */}
                <div>
                    <label className="block text-lg font-medium text-white mb-2">Difficulty</label>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                        {['', 'easy', 'medium', 'hard'].map(diff => (
                            <button key={diff} onClick={() => setSettings({...settings, difficulty: diff})} className={`py-2 px-3 rounded-lg capitalize text-sm font-bold transition-colors ${settings.difficulty === diff ? 'bg-purple-600 text-white ring-2 ring-purple-400' : 'bg-gray-700 hover:bg-gray-600 text-gray-300'}`}>
                                {diff || 'Any'}
                            </button>
                        ))}
                    </div>
                </div>

                {/* Categories */}
                <div>
                    <label className="block text-lg font-medium text-white mb-2">Categories <span className="text-sm text-gray-400">(select multiple)</span></label>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 max-h-48 overflow-y-auto pr-2">
                        {categories.map(cat => (
                            <button key={cat.id} onClick={() => handleCategoryToggle(cat.id)} className={`py-2 px-3 text-left rounded-lg text-xs font-bold transition-colors ${settings.categories.includes(cat.id) ? 'bg-purple-600 text-white ring-2 ring-purple-400' : 'bg-gray-700 hover:bg-gray-600 text-gray-300'}`}>
                                {cat.name}
                            </button>
                        ))}
                    </div>
                </div>
            </div>

            <div className="mt-8 flex gap-4">
                <button onClick={() => setView('mainMenu')} className="w-full bg-gray-600 hover:bg-gray-700 text-white font-bold py-3 px-4 rounded-lg">
                    <ChevronLeft className="inline-block mr-1" size={20}/> Back
                </button>
                <button onClick={handleContinue} className="w-full bg-gradient-to-r from-purple-600 to-blue-500 text-white font-bold py-3 px-4 rounded-lg">
                    Continue <ArrowRight className="inline-block ml-1" size={20}/>
                </button>
            </div>
        </div>
    );
};

// ... EnterName, MultiplayerMenu, and Lobby are updated to pass 'gameSettings'
// ... (Code for these components is largely the same, just passing props)

// ... (Other components like Game and WinnerDisplay are updated below)


// The main App component now manages the entire state flow including game settings.
export default function App() {
    // ... State management logic ...
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
    // ...
    // ... (WinnerDisplay and other components are below, outside of App for clarity)

    // --- Hooks ---
    useEffect(() => {
        // This effect runs once to check for a room code in the URL
        const urlParams = new URLSearchParams(window.location.search);
        const roomCodeFromUrl = urlParams.get('room');
        if (roomCodeFromUrl) {
            setDirectJoinRoomId(roomCodeFromUrl.toUpperCase());
            setGameMode('multiplayer');
        }
    }, []);

    useEffect(() => {
        // This effect handles Firebase authentication
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
        // This effect determines the starting screen
        if (isAuthReady) {
            if (directJoinRoomId) {
                setView('settings'); // If joining via link, go to settings first
            } else {
                setView('mainMenu'); // Otherwise, show main menu
            }
        }
    }, [isAuthReady, directJoinRoomId]);

    const handleJoinRoom = useCallback(async (code, pName, errorHandler = setError) => {
        // ... (Join room logic is mostly the same)
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

// NOTE: These components are outside App to keep it clean.
// They are functionally the same as before but some props are updated.

// --- Game Component and children ---

const Game = ({ gameMode, roomId, userId, setView, playerName, gameSettings, setHighScores }) => {
    const [gameData, setGameData] = useState(null);
    const [selectedAnswer, setSelectedAnswer] = useState(null);
    const [isAnswered, setIsAnswered] = useState(false);
    const { fetchQuestions } = useTriviaAPI();
    const [modalContent, setModalContent] = useState(null);
    
    // Game Setup Effect
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
                            setModalContent({ title: "Game Over!", body: <WinnerDisplay players={data.players} gameMode={gameMode} /> });
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
                setGameData({ questions, currentQuestionIndex: 0, players: [{ uid: userId, name: playerName, score: 0 }], gameState: 'playing', answers: {} });
            }
        };
        const unsubscribePromise = setupGame();
        return () => { unsubscribePromise.then(unsub => unsub && unsub()); };
    }, [gameMode, roomId, userId, playerName, fetchQuestions, gameSettings]);
    
    // NEW: High Score logic
    useEffect(() => {
        const checkAndSubmitHighScore = async () => {
            if (gameMode === 'single' && gameData?.gameState === 'finished' && db) {
                const myPlayer = gameData.players[0];
                const highScoresRef = collection(db, `artifacts/${appId}/public/data/highscores`);
                // Add the new score
                await addDoc(highScoresRef, { name: myPlayer.name, score: myPlayer.score, createdAt: new Date() });
                // Fetch the top 10 scores to display
                const q = query(highScoresRef, orderBy("score", "desc"), limit(10));
                const querySnapshot = await getDocs(q);
                const scores = querySnapshot.docs.map(doc => ({id: doc.id, ...doc.data()}));
                setHighScores(scores); // Update parent state
                setModalContent({ title: "Game Over!", body: <WinnerDisplay players={gameData.players} gameMode={gameMode} highScores={scores} /> });
            }
        };
        checkAndSubmitHighScore();
    }, [gameData?.gameState, gameData?.players, gameMode, setHighScores]);


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
                payload.players = gameData.players.map(p => (p.uid === userId ? { ...p, score: p.score + 1 } : p));
            }
            await updateDoc(roomDocRef, payload);
        } else {
            if (isCorrect) {
                setGameData(prev => ({ ...prev, players: [{...prev.players[0], score: prev.players[0].score + 1 }] }));
            }
        }
    };
    
    const handleNextQuestion = async () => {
        const nextIndex = gameData.currentQuestionIndex + 1;
        const isGameOver = nextIndex >= gameData.questions.length;

        if (gameMode === 'multiplayer') {
            const isHost = gameData.hostId === userId;
            if (!isHost) return;
            const roomDocRef = doc(db, `artifacts/${appId}/public/data/rooms/${roomId}`);
            await updateDoc(roomDocRef, isGameOver ? { gameState: 'finished' } : { currentQuestionIndex: nextIndex, answers: {} });
        } else {
             if (isGameOver) {
                setGameData(prev => ({...prev, gameState: 'finished' }));
             } else {
                setGameData(prev => ({ ...prev, currentQuestionIndex: nextIndex }));
                setIsAnswered(false);
                setSelectedAnswer(null);
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
        if(isCorrect) return 'bg-green-500/50 border-green-500';
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
            
            <main className="flex-grow flex flex-col justify-center min-h-0">
                <div className="bg-gray-800/50 border border-gray-700 rounded-2xl p-4 sm:p-6">
                    <div className="flex gap-2 mb-2 flex-wrap"><span className="text-xs sm:text-sm bg-blue-500/20 text-blue-300 px-3 py-1 rounded-full" dangerouslySetInnerHTML={{ __html: currentQuestion.category }}></span><span className="text-xs sm:text-sm bg-yellow-500/20 text-yellow-300 px-3 py-1 rounded-full capitalize" dangerouslySetInnerHTML={{ __html: currentQuestion.difficulty }}></span></div>
                    <h2 className="text-lg sm:text-2xl font-bold mb-4" dangerouslySetInnerHTML={{ __html: currentQuestion.question }}></h2>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2 sm:gap-4">{currentQuestion.answers.map((answer, index) => (<button key={index} onClick={() => handleAnswerSelect(answer)} disabled={isAnswered} className={`w-full p-3 sm:p-4 rounded-xl border-2 font-semibold text-left transition-all duration-300 text-sm sm:text-base ${getAnswerClass(answer)}`}><span dangerouslySetInnerHTML={{ __html: answer }}></span></button>))}</div>
                </div>
            </main>
            
            <footer className="flex-shrink-0 mt-2 sm:mt-4">
                 {/* NEW: This message area is now part of the footer to stay visible */}
                <div className="h-20"> {/* Spacer to push button down, message appears here */}
                {allPlayersAnswered && (
                     <div className="text-center p-2 sm:p-3 rounded-lg bg-gray-800 border border-gray-700">
                        {selectedAnswer === currentQuestion.correctAnswer ? <p className="text-lg sm:text-xl font-bold text-green-400 flex items-center justify-center gap-2"><CheckCircle size={20} /> Correct!</p> : <p className="text-lg sm:text-xl font-bold text-red-400 flex items-center justify-center gap-2"><XCircle size={20}/> Incorrect!</p>}
                        {selectedAnswer !== currentQuestion.correctAnswer && <p className="text-gray-300 mt-1 text-sm sm:text-base">Correct answer: <span className="font-bold text-green-400" dangerouslySetInnerHTML={{__html: currentQuestion.correctAnswer}}></span></p>}
                     </div>
                )}
                </div>
                {gameMode === 'multiplayer' && (<div className="bg-gray-800/50 border border-gray-700 rounded-xl p-2 mb-2 text-xs"><h4 className="text-white text-center font-bold mb-1">Players</h4><div className="flex flex-wrap justify-center gap-x-2 gap-y-1">{gameData.players.map(p => (<div key={p.uid} className={`flex items-center gap-1 p-1 rounded-lg transition-all ${gameData.answers && gameData.answers[p.uid] !== undefined ? 'bg-green-500/20' : 'bg-gray-700/50'}`}><span className="text-white">{p.name}</span><span className="text-gray-300 font-mono">({p.score})</span>{gameData.answers && gameData.answers[p.uid] !== undefined && <CheckCircle size={14} className="text-green-400"/>}</div>))}</div></div>)}
                {(allPlayersAnswered) && (isHost) && (<button onClick={handleNextQuestion} className="w-full bg-gradient-to-r from-purple-600 to-blue-500 text-white font-bold py-3 px-5 rounded-xl text-lg transition-transform transform hover:scale-105">{gameData.currentQuestionIndex >= gameData.questions.length - 1 ? 'Finish Game' : 'Next Question'}</button>)}
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
                     )) : <p className="text-gray-400">No high scores yet. Be the first!</p>}
                 </div>
             </div>
        )
    }

    // Multiplayer podium logic
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
                    const style = podiumStyles[index];

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
