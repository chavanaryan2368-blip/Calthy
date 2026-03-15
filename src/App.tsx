/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useRef, useEffect } from 'react';
import { playPcmBase64 } from './utils/audio';
import { 
  Camera, 
  Upload, 
  Utensils, 
  TrendingUp, 
  Plus, 
  ChevronRight,
  ChevronDown,
  Info, 
  CheckCircle2, 
  AlertCircle,
  History,
  ArrowLeft,
  Flame,
  Zap,
  Droplets,
  Wind,
  User,
  Lock,
  Mail,
  ArrowRight,
  Sparkles,
  LogOut,
  Home,
  MessageSquare,
  User as UserIcon,
  Mic,
  MicOff,
  Volume2,
  VolumeX,
  Settings,
  Thermometer,
  CloudSun,
  Coins,
  ArrowUp,
  Search,
  BarChart3,
  GlassWater,
  Trophy,
  Activity,
  Footprints,
  Moon,
  Sun
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  PieChart, 
  Pie, 
  Cell, 
  ResponsiveContainer, 
  Tooltip as RechartsTooltip,
  BarChart,
  Bar,
  XAxis,
  YAxis
} from 'recharts';
import { format, startOfWeek, addDays, subDays } from 'date-fns';
import { 
  signInWithPopup, 
  GoogleAuthProvider, 
  onAuthStateChanged, 
  signOut,
  browserLocalPersistence,
  User as FirebaseUser
} from 'firebase/auth';
import { 
  collection, 
  doc, 
  setDoc, 
  getDoc, 
  onSnapshot, 
  query, 
  orderBy, 
  deleteDoc,
  updateDoc,
  addDoc,
  limit
} from 'firebase/firestore';
import { auth, db } from './firebase';
import { geminiService } from './services/geminiService';
import { MealAnalysis, DietPlan, FoodItem, FOOD_DATABASE, FOOD_CATEGORIES } from './constants';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import RunTracker from './components/RunTracker';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId: string | undefined;
    email: string | null | undefined;
    emailVerified: boolean | undefined;
    isAnonymous: boolean | undefined;
    tenantId: string | null | undefined;
    providerInfo: {
      providerId: string;
      displayName: string | null;
      email: string | null;
      photoUrl: string | null;
    }[];
  }
}

function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData.map(provider => ({
        providerId: provider.providerId,
        displayName: provider.displayName,
        email: provider.email,
        photoUrl: provider.photoURL
      })) || []
    },
    operationType,
    path
  }
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

class ErrorBoundary extends React.Component<{ children: React.ReactNode }, { hasError: boolean; error: any }> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: any) {
    return { hasError: true, error };
  }

  render() {
    if (this.state.hasError) {
      let errorMessage = "Something went wrong.";
      try {
        const parsed = JSON.parse(this.state.error.message);
        if (parsed.error) errorMessage = parsed.error;
      } catch (e) {}

      return (
        <div className="min-h-screen bg-bg-main flex items-center justify-center p-6 text-center">
          <div className="glass-card p-8 rounded-[2.5rem] max-w-md space-y-4">
            <div className="w-16 h-16 bg-red-500/10 rounded-2xl flex items-center justify-center mx-auto">
              <AlertCircle className="w-8 h-8 text-red-500" />
            </div>
            <h2 className="text-2xl font-black">Oops!</h2>
            <p className="text-text-muted">{errorMessage}</p>
            <button 
              onClick={() => window.location.reload()}
              className="btn-primary w-full py-4"
            >
              Reload App
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

interface LoggedMeal extends MealAnalysis {
  id: string;
  timestamp: number;
  image?: string;
}

type AuthMode = 'login' | 'signup' | 'onboarding' | 'authenticated';

type MainView = 'home' | 'food' | 'log' | 'stats' | 'profile' | 'chat' | 'run' | 'fasting' | 'favorites';

interface FastingSession {
  startTime: number;
  duration: number; // in hours
  isActive: boolean;
}

interface Reminder {
  id: string;
  label: string;
  time: string;
  enabled: boolean;
}

interface UserProfile {
  name: string;
  email: string;
  age: number;
  weight: number;
  height: number;
  goal: 'loss' | 'gain' | 'maintain';
  role?: 'user' | 'admin';
}

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

interface ActivityLog {
  id: string;
  type: string;
  distance: number;
  time: number;
  calories: number;
  timestamp: number;
  path?: { lat: number; lng: number }[];
}

export default function App() {
  const [isAuthReady, setIsAuthReady] = useState(false);
  const [firebaseUser, setFirebaseUser] = useState<FirebaseUser | null>(null);
  const [authMode, setAuthMode] = useState<AuthMode>('login');
  const authModeRef = useRef<AuthMode>(authMode);
  useEffect(() => {
    authModeRef.current = authMode;
  }, [authMode]);

  const [user, setUser] = useState<UserProfile | null>(null);

  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [loginError, setLoginError] = useState<string | null>(null);
  const [notification, setNotification] = useState<{ message: string; type: 'success' | 'info' | 'error' } | null>(null);

  // Onboarding State
  const [onboardingData, setOnboardingData] = useState({
    name: '',
    age: '',
    height: '',
    weight: '',
    goal: 'maintain' as 'loss' | 'gain' | 'maintain',
    theme: 'dark' as 'dark' | 'light'
  });

  const [meals, setMeals] = useState<LoggedMeal[]>([]);
  
  const [waterIntake, setWaterIntake] = useState<number>(0);

  const [activeTab, setActiveTab] = useState<MainView>('home');
  const [waterGlasses, setWaterGlasses] = useState<number>(0);

  const [selectedCategory, setSelectedCategory] = useState('All');
  const [searchQuery, setSearchQuery] = useState('');
  const [logMode, setLogMode] = useState<'ai' | 'search'>('ai');
  const [mealType, setMealType] = useState<'Breakfast' | 'Lunch' | 'Dinner' | 'Snack'>('Lunch');
  
  const [isEditingProfile, setIsEditingProfile] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [inputText, setInputText] = useState('');
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  
  // AI Chat State
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [isChatting, setIsChatting] = useState(false);
  const [isGeneratingVoice, setIsGeneratingVoice] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isMuted, setIsMuted] = useState(false);

  // Diet Plan State
  const [dietPlan, setDietPlan] = useState<DietPlan | null>(null);
  const [activities, setActivities] = useState<ActivityLog[]>([]);
  const [fasting, setFasting] = useState<FastingSession>({ startTime: 0, duration: 16, isActive: false });
  const [reminders, setReminders] = useState<Reminder[]>([
    { id: '1', label: 'Breakfast', time: '08:00', enabled: true },
    { id: '2', label: 'Lunch', time: '13:00', enabled: true },
    { id: '3', label: 'Dinner', time: '20:00', enabled: true },
    { id: '4', label: 'Water Intake', time: '10:00', enabled: true },
  ]);
  const [favorites, setFavorites] = useState<string[]>([]);
  const [showRemindersModal, setShowRemindersModal] = useState(false);
  const [showAboutModal, setShowAboutModal] = useState(false);
  const [fastingTimeLeft, setFastingTimeLeft] = useState<number>(0);
  const [notificationPermission, setNotificationPermission] = useState<NotificationPermission>(
    typeof window !== 'undefined' ? Notification.permission : 'default'
  );
  const [activeMacro, setActiveMacro] = useState<{ name: string; value: number; color: string } | null>(null);
  const [selectedMeal, setSelectedMeal] = useState<LoggedMeal | null>(null);
  const [selectedStatsDay, setSelectedStatsDay] = useState<string | null>(null);
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });
  const [theme, setTheme] = useState<'dark' | 'light'>(() => {
    return (localStorage.getItem('calthy_theme') as 'dark' | 'light') || 'dark';
  });

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (fUser) => {
      setFirebaseUser(fUser);
      if (fUser) {
        const currentAuthMode = authModeRef.current;
        try {
          const userDoc = await getDoc(doc(db, 'users', fUser.uid));
          
          if (userDoc.exists()) {
            // If user is trying to "Sign Up" but account exists, block them and show error
            if (currentAuthMode === 'signup') {
              await auth.signOut();
              setLoginError("This Google account is already in use. Please log in instead or use a different account.");
              setAuthMode('login');
              setFirebaseUser(null);
              setUser(null);
              setIsAuthReady(true);
              return;
            }
            // Normal login
            setUser(userDoc.data() as UserProfile);
            setAuthMode('authenticated');
          } else {
            // If user is trying to "Log In" but account doesn't exist
            if (currentAuthMode === 'login') {
              await auth.signOut();
              setLoginError("No account found with this Google ID. Please sign up first.");
              setAuthMode('signup');
              setFirebaseUser(null);
              setUser(null);
              setIsAuthReady(true);
              return;
            }

            setUser(null);
            setAuthMode('onboarding');
          }
        } catch (error) {
          console.error("Error fetching user profile:", error);
          setLoginError("An error occurred during authentication. Please try again.");
        }
      } else {
        // Only reset to login if we're not already in a login/signup flow
        if (authModeRef.current === 'authenticated') {
          setAuthMode('login');
        }
        setUser(null);
      }
      setIsAuthReady(true);
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!firebaseUser) return;

    const mealsQuery = query(collection(db, 'users', firebaseUser.uid, 'meals'), orderBy('timestamp', 'desc'));
    const unsubMeals = onSnapshot(mealsQuery, (snapshot) => {
      const mealsData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as LoggedMeal));
      setMeals(mealsData);
    }, (error) => handleFirestoreError(error, OperationType.LIST, `users/${firebaseUser.uid}/meals`));

    const activitiesQuery = query(collection(db, 'users', firebaseUser.uid, 'activities'), orderBy('timestamp', 'desc'));
    const unsubActivities = onSnapshot(activitiesQuery, (snapshot) => {
      const activitiesData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as ActivityLog));
      setActivities(activitiesData);
    }, (error) => handleFirestoreError(error, OperationType.LIST, `users/${firebaseUser.uid}/activities`));

    const unsubFasting = onSnapshot(doc(db, 'users', firebaseUser.uid, 'fasting', 'current'), (doc) => {
      if (doc.exists()) {
        setFasting(doc.data() as FastingSession);
      }
    }, (error) => handleFirestoreError(error, OperationType.GET, `users/${firebaseUser.uid}/fasting/current`));

    const unsubReminders = onSnapshot(collection(db, 'users', firebaseUser.uid, 'reminders'), (snapshot) => {
      const remindersData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Reminder));
      if (remindersData.length > 0) {
        setReminders(remindersData);
      } else {
        // Initialize default reminders in Firestore if they don't exist
        const defaultReminders = [
          { id: '1', label: 'Breakfast', time: '08:00', enabled: true },
          { id: '2', label: 'Lunch', time: '13:00', enabled: true },
          { id: '3', label: 'Dinner', time: '20:00', enabled: true },
          { id: '4', label: 'Water Intake', time: '10:00', enabled: true },
        ];
        defaultReminders.forEach(async (r) => {
          try {
            await setDoc(doc(db, 'users', firebaseUser.uid, 'reminders', r.id), r);
          } catch (error) {
            console.error("Error initializing reminder:", error);
          }
        });
      }
    }, (error) => handleFirestoreError(error, OperationType.LIST, `users/${firebaseUser.uid}/reminders`));

    const unsubFavorites = onSnapshot(collection(db, 'users', firebaseUser.uid, 'favorites'), (snapshot) => {
      const favoritesData = snapshot.docs.map(doc => doc.data().foodId as string);
      setFavorites(favoritesData);
    }, (error) => handleFirestoreError(error, OperationType.LIST, `users/${firebaseUser.uid}/favorites`));

    return () => {
      unsubMeals();
      unsubActivities();
      unsubFasting();
      unsubReminders();
      unsubFavorites();
    };
  }, [firebaseUser]);

  useEffect(() => {
    if (!firebaseUser) return;
    const today = format(new Date(), 'yyyy-MM-dd');
    const unsubDaily = onSnapshot(doc(db, 'users', firebaseUser.uid, 'dailyLogs', today), (doc) => {
      if (doc.exists()) {
        const data = doc.data();
        setWaterIntake(data.waterIntake || 0);
        setWaterGlasses(data.waterGlasses || 0);
      }
    }, (error) => handleFirestoreError(error, OperationType.GET, `users/${firebaseUser.uid}/dailyLogs/${today}`));
    return () => unsubDaily();
  }, [firebaseUser]);

  const updateDailyLog = async (updates: any) => {
    if (!firebaseUser) return;
    const today = format(new Date(), 'yyyy-MM-dd');
    try {
      await setDoc(doc(db, 'users', firebaseUser.uid, 'dailyLogs', today), updates, { merge: true });
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, `users/${firebaseUser.uid}/dailyLogs/${today}`);
    }
  };

  useEffect(() => {
    localStorage.setItem('calthy_theme', theme);
    if (theme === 'light') {
      document.documentElement.classList.add('light');
    } else {
      document.documentElement.classList.remove('light');
    }
  }, [theme]);

  const [isGeneratingPlan, setIsGeneratingPlan] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const audioRef = useRef<{ stop: () => void } | null>(null);

  useEffect(() => {
    if ("Notification" in window && Notification.permission === "default") {
      Notification.requestPermission();
    }
  }, []);

  const sendNotification = (title: string, body: string) => {
    if (!("Notification" in window)) return;
    
    if (Notification.permission === "granted") {
      try {
        new Notification(title, { body, icon: '/favicon.ico' });
        
        // Play sound if not muted
        if (!isMuted) {
          const audio = new Audio('https://assets.mixkit.co/active_storage/sfx/2869/2869-preview.mp3');
          audio.play().catch(e => console.error("Audio play failed:", e));
        }
      } catch (e) {
        console.error("Notification error:", e);
      }
    }
  };

  useEffect(() => {
    localStorage.setItem('calthy_fasting', JSON.stringify(fasting));
  }, [fasting]);

  useEffect(() => {
    localStorage.setItem('calthy_reminders', JSON.stringify(reminders));
  }, [reminders]);

  useEffect(() => {
    localStorage.setItem('calthy_favorites', JSON.stringify(favorites));
  }, [favorites]);

  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (fasting.isActive) {
      const updateTimer = () => {
        const now = Date.now();
        const elapsed = (now - fasting.startTime) / (1000 * 60 * 60); // in hours
        const left = Math.max(0, fasting.duration - elapsed);
        
        // Check for completion to send notification
        setFastingTimeLeft(prev => {
          if (left === 0 && prev > 0) {
            sendNotification("Fast Complete! 🎉", "You've reached your fasting goal. Time to refuel!");
          }
          return left;
        });
        if (left === 0) {
          setFasting(prev => ({ ...prev, isActive: false }));
        }
      };
      updateTimer();
      interval = setInterval(updateTimer, 1000);
    }
    return () => clearInterval(interval);
  }, [fasting]);

  useEffect(() => {
    const saved = localStorage.getItem('calthy_water_glasses');
    const today = format(new Date(), 'yyyy-MM-dd');
    const data = saved ? JSON.parse(saved) : {};
    data[today] = waterGlasses;
    localStorage.setItem('calthy_water_glasses', JSON.stringify(data));
  }, [waterGlasses]);

  // Notification logic
  useEffect(() => {
    const syncPermission = () => {
      if (typeof window !== 'undefined' && "Notification" in window) {
        setNotificationPermission(Notification.permission);
      }
    };

    window.addEventListener('focus', syncPermission);
    const permInterval = setInterval(syncPermission, 2000); // Check every 2 seconds to be responsive

    if (typeof window === 'undefined' || !("Notification" in window)) return;
    
    if (Notification.permission === "default") {
      Notification.requestPermission().then(permission => {
        setNotificationPermission(permission);
      });
    }

    const checkReminders = () => {
      const now = new Date();
      const currentTime = format(now, 'HH:mm');
      
      reminders.forEach(reminder => {
        if (reminder.enabled && reminder.time === currentTime) {
          const lastNotified = localStorage.getItem(`notified_${reminder.id}`);
          const today = format(now, 'yyyy-MM-dd');
          if (lastNotified !== `${today}_${currentTime}`) {
            sendNotification("Calthy Reminder 🥗", reminder.label);
            localStorage.setItem(`notified_${reminder.id}`, `${today}_${currentTime}`);
          }
        }
      });
    };

    const interval = setInterval(checkReminders, 10000); // Check every 10 seconds for better accuracy
    return () => {
      window.removeEventListener('focus', syncPermission);
      clearInterval(permInterval);
      clearInterval(interval);
    };
  }, [reminders, notificationPermission, isMuted]);

  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good Morning';
    if (hour < 17) return 'Good Afternoon';
    return 'Good Evening';
  };

  const getWeeklyData = () => {
    const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const today = new Date();
    const data = [];
    
    for (let i = 6; i >= 0; i--) {
      const date = subDays(today, i);
      const dayName = days[date.getDay()];
      const dateStr = format(date, 'yyyy-MM-dd');
      
      const dayKcal = meals
        .filter(m => format(m.timestamp, 'yyyy-MM-dd') === dateStr)
        .reduce((sum, m) => sum + m.calories, 0);
        
      data.push({
        day: dayName,
        kcal: dayKcal,
        date: dateStr,
        fullDate: format(date, 'MMMM d, yyyy')
      });
    }
    return data;
  };

  const calculateStreaks = () => {
    if (meals.length === 0) return { current: 0, best: 0 };
    
    const loggedDates = Array.from(new Set(meals.map(m => format(m.timestamp, 'yyyy-MM-dd')))).sort();
    
    let currentStreak = 0;
    let bestStreak = 0;
    let tempStreak = 0;
    
    const today = format(new Date(), 'yyyy-MM-dd');
    const yesterday = format(subDays(new Date(), 1), 'yyyy-MM-dd');
    
    // Check if streak is still active (logged today or yesterday)
    const lastLoggedDate = loggedDates[loggedDates.length - 1];
    const isStreakActive = lastLoggedDate === today || lastLoggedDate === yesterday;
    
    if (isStreakActive) {
      let checkDate = lastLoggedDate === today ? new Date() : subDays(new Date(), 1);
      while (loggedDates.includes(format(checkDate, 'yyyy-MM-dd'))) {
        currentStreak++;
        checkDate = subDays(checkDate, 1);
      }
    }
    
    // Calculate best streak
    if (loggedDates.length > 0) {
      tempStreak = 1;
      bestStreak = 1;
      for (let i = 1; i < loggedDates.length; i++) {
        const prevDate = new Date(loggedDates[i-1]);
        const currDate = new Date(loggedDates[i]);
        const diff = Math.round((currDate.getTime() - prevDate.getTime()) / (1000 * 60 * 60 * 24));
        
        if (diff === 1) {
          tempStreak++;
        } else {
          tempStreak = 1;
        }
        bestStreak = Math.max(bestStreak, tempStreak);
      }
    }
    
    return { current: currentStreak, best: bestStreak };
  };

  const { current: currentStreak, best: bestStreak } = calculateStreaks();

  const getDailyGoal = () => {
    if (!user) return 2000;
    const base = (10 * user.weight) + (6.25 * user.height) - (5 * user.age);
    if (user.goal === 'loss') return Math.round(base - 300);
    if (user.goal === 'gain') return Math.round(base + 500);
    return Math.round(base + 100); // maintain/default
  };

  const dailyGoal = getDailyGoal();

  const weeklyData = getWeeklyData();
  const selectedDayMeals = selectedStatsDay 
    ? meals.filter(m => format(m.timestamp, 'yyyy-MM-dd') === selectedStatsDay)
    : [];

  useEffect(() => {
    if (notification) {
      const timer = setTimeout(() => setNotification(null), 5000);
      return () => clearTimeout(timer);
    }
  }, [notification]);

  const handleGoogleLogin = async () => {
    if (isLoggingIn) return;
    setIsLoggingIn(true);
    setLoginError(null);
    const provider = new GoogleAuthProvider();
    
    // Add custom parameters to force account selection and improve reliability
    provider.setCustomParameters({
      prompt: 'select_account'
    });

    try {
      // Explicitly set persistence to ensure it's handled correctly in iframe
      await auth.setPersistence(browserLocalPersistence);
      await signInWithPopup(auth, provider);
    } catch (error: any) {
      console.error("Login failed:", error);
      
      if (error.code === 'auth/popup-blocked') {
        setLoginError("Popup blocked! Please allow popups for this site in your browser settings and try again.");
      } else if (error.code === 'auth/cancelled-popup-request') {
        setLoginError("Login request was cancelled. Please try again.");
      } else if (error.code === 'auth/popup-closed-by-user') {
        setLoginError("Login window was closed. Please try again.");
      } else if (error.message?.includes('INTERNAL ASSERTION FAILED') || error.code === 'auth/internal-error') {
        setLoginError("A technical error occurred with the login service. Please refresh the page (F5) and try again.");
      } else {
        setLoginError(`Login failed: ${error.message || 'Unknown error'}. Please try again.`);
      }
    } finally {
      setIsLoggingIn(false);
    }
  };

  const handleOnboardingSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!firebaseUser) return;
    if (!onboardingData.name || !onboardingData.age || !onboardingData.height || !onboardingData.weight) {
      setNotification({ message: "All fields are compulsory.", type: 'error' });
      return;
    }

    try {
      const newProfile: UserProfile = {
        name: onboardingData.name,
        email: firebaseUser.email || '',
        age: parseInt(onboardingData.age),
        weight: parseInt(onboardingData.weight),
        height: parseInt(onboardingData.height),
        goal: onboardingData.goal,
        role: 'user'
      };
      
      await setDoc(doc(db, 'users', firebaseUser.uid), newProfile);
      setUser(newProfile);
      setTheme(onboardingData.theme);
      localStorage.setItem('calthy_theme', onboardingData.theme);
      setAuthMode('authenticated');
      setNotification({ message: "Welcome to Calthy! Your profile is ready.", type: 'success' });
    } catch (error) {
      console.error("Onboarding error:", error);
      setNotification({ message: "Failed to save profile. Please try again.", type: 'error' });
    }
  };

  const handleLogout = async () => {
    try {
      await signOut(auth);
    } catch (error) {
      console.error("Logout failed:", error);
    }
  };

  const handleUpdateProfile = async (data: any) => {
    if (!firebaseUser) return;
    const updatedProfile: UserProfile = {
      name: data.name || user?.name || 'User',
      email: data.email || user?.email || '',
      age: Number(data.age) || user?.age || 22,
      weight: Number(data.weight) || user?.weight || 70,
      height: Number(data.height) || user?.height || 175,
      goal: data.goal || user?.goal || 'maintain'
    };
    try {
      await setDoc(doc(db, 'users', firebaseUser.uid), updatedProfile, { merge: true });
      setUser(updatedProfile);
      setIsEditingProfile(false);
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `users/${firebaseUser.uid}`);
    }
  };

  const dailyStats = meals
    .filter(m => format(m.timestamp, 'yyyy-MM-dd') === format(Date.now(), 'yyyy-MM-dd'))
    .reduce((acc, curr) => ({
      calories: acc.calories + (curr.calories || 0),
      protein: acc.protein + (curr.protein || 0),
      carbs: acc.carbs + (curr.carbs || 0),
      fats: acc.fats + (curr.fats || (curr as any).fat || 0),
    }), { calories: 0, protein: 0, carbs: 0, fats: 0 });

  const calorieGoal = dailyGoal;
  const proteinGoal = (user?.weight || 70) * (user?.goal === 'gain' ? 2 : 1.5);
  const carbsGoal = (calorieGoal * 0.5) / 4;
  const fatsGoal = (calorieGoal * 0.25) / 9;
  
  const calorieProgress = Math.min((dailyStats.calories / calorieGoal) * 100, 100);
  const waterGoal = 3000; // 3L
  const waterProgress = Math.min((waterIntake / waterGoal) * 100, 100);

  // Pie Chart Data Calculation
  const macroKcal = dailyStats.protein * 4 + dailyStats.carbs * 4 + dailyStats.fats * 9;
  const macroRatio = macroKcal > 0 ? dailyStats.calories / macroKcal : 1;
  
  const pieData = [
    { name: 'Protein', value: dailyStats.protein, color: 'var(--color-brand-accent)', kcal: dailyStats.protein * 4 * macroRatio },
    { name: 'Carbs', value: dailyStats.carbs, color: 'var(--color-brand-primary)', kcal: dailyStats.carbs * 4 * macroRatio },
    { name: 'Fats', value: dailyStats.fats, color: 'var(--color-brand-secondary)', kcal: dailyStats.fats * 9 * macroRatio },
    { name: 'Remaining', value: Math.max(0, calorieGoal - dailyStats.calories), color: 'var(--color-glass-bg)', kcal: Math.max(0, calorieGoal - dailyStats.calories) }
  ];

  const handleSendMessage = async (text: string) => {
    if (!text.trim()) return;
    
    const userMsg: ChatMessage = { role: 'user', content: text };
    setChatMessages(prev => [...prev, userMsg]);
    setIsChatting(true);

    try {
      const response = await geminiService.chatWithAssistant(text, chatMessages);
      const assistantMsg: ChatMessage = { role: 'assistant', content: response };
      setChatMessages(prev => [...prev, assistantMsg]);
      setIsChatting(false); // Stop text loading spinner as soon as text is here
      
      // Auto-speak the response
      setIsGeneratingVoice(true);
      const audioData = await geminiService.textToSpeech(response);
      setIsGeneratingVoice(false);
      
      if (audioData) {
        const playback = await playPcmBase64(audioData);
        if (playback) {
          audioRef.current = playback;
          setIsSpeaking(true);
          playback.onEnded(() => setIsSpeaking(false));
        }
      }
    } catch (error) {
      console.error("Chat failed:", error);
      setIsChatting(false);
      setIsGeneratingVoice(false);
    }
  };

  const handleGenerateDietPlan = async () => {
    if (!user) return;
    setIsGeneratingPlan(true);
    try {
      const plan = await geminiService.generateDietPlan(user, { climate: 'Tropical', season: 'Summer' });
      setDietPlan(plan);
    } catch (error) {
      console.error("Diet plan failed:", error);
    } finally {
      setIsGeneratingPlan(false);
    }
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setSelectedImage(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleQuickAdd = async (food: FoodItem) => {
    if (!firebaseUser) return;
    const newMeal: any = {
      mealName: food.name,
      calories: food.calories,
      protein: food.protein,
      carbs: food.carbs,
      fats: food.fats,
      fiber: 0,
      healthRating: 8,
      advice: "Great choice! This is a healthy staple.",
      ingredients: [food.portion],
      mealType: mealType,
      timestamp: Date.now(),
      uid: firebaseUser.uid
    };
    try {
      await addDoc(collection(db, 'users', firebaseUser.uid, 'meals'), newMeal);
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, `users/${firebaseUser.uid}/meals`);
    }
  };

  const handleAnalyze = async () => {
    if ((!inputText && !selectedImage) || !firebaseUser) return;

    setIsAnalyzing(true);
    try {
      let result: MealAnalysis;
      if (selectedImage) {
        const base64Data = selectedImage.split(',')[1];
        result = await geminiService.analyzeMeal({
          data: base64Data,
          mimeType: "image/jpeg"
        });
      } else {
        result = await geminiService.analyzeMeal(inputText);
      }

      const newMeal: any = {
        mealName: result.mealName,
        calories: result.calories,
        protein: result.protein,
        carbs: result.carbs,
        fats: result.fats,
        fiber: result.fiber,
        healthRating: result.healthRating,
        advice: result.advice,
        ingredients: result.ingredients,
        mealType: mealType,
        timestamp: Date.now(),
        image: selectedImage || undefined,
        uid: firebaseUser.uid
      };

      await addDoc(collection(db, 'users', firebaseUser.uid, 'meals'), newMeal);
      setInputText('');
      setSelectedImage(null);
      setActiveTab('home');
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, `users/${firebaseUser.uid}/meals`);
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleDeleteMeal = async (mealId: string) => {
    if (!firebaseUser) return;
    try {
      await deleteDoc(doc(db, 'users', firebaseUser.uid, 'meals', mealId));
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `users/${firebaseUser.uid}/meals/${mealId}`);
    }
  };

  const handleFastingToggle = async () => {
    if (!firebaseUser) return;
    const isStarting = !fasting.isActive;
    const newFasting = {
      ...fasting,
      isActive: isStarting,
      startTime: isStarting ? Date.now() : 0
    };
    try {
      await setDoc(doc(db, 'users', firebaseUser.uid, 'fasting', 'current'), newFasting);
      if (isStarting) {
        sendNotification("Fast Started! ⏳", `Your ${fasting.duration}h fast has begun. Stay hydrated!`);
      } else {
        sendNotification("Fast Ended! 🍽️", "Great job! You've completed your fasting session.");
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, `users/${firebaseUser.uid}/fasting/current`);
    }
  };

  const handleToggleReminder = async (id: string) => {
    if (!firebaseUser) return;
    const reminder = reminders.find(r => r.id === id);
    if (!reminder) return;
    try {
      await setDoc(doc(db, 'users', firebaseUser.uid, 'reminders', id), {
        enabled: !reminder.enabled
      }, { merge: true });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `users/${firebaseUser.uid}/reminders/${id}`);
    }
  };

  const handleToggleFavorite = async (foodId: string) => {
    if (!firebaseUser) return;
    const isFav = favorites.includes(foodId);
    try {
      if (isFav) {
        await deleteDoc(doc(db, 'users', firebaseUser.uid, 'favorites', foodId));
      } else {
        await setDoc(doc(db, 'users', firebaseUser.uid, 'favorites', foodId), { foodId });
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, `users/${firebaseUser.uid}/favorites/${foodId}`);
    }
  };

  if (!isAuthReady) {
    return (
      <div className="min-h-screen bg-dark-bg flex items-center justify-center">
        <div className="w-16 h-16 border-4 border-brand-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (authMode !== 'authenticated') {
    return (
      <div className={cn("min-h-screen flex flex-col md:flex-row overflow-hidden relative transition-colors duration-500", 
        theme === 'dark' ? "bg-dark-bg text-white" : "bg-slate-50 text-slate-900"
      )}>
        {/* Toast Notification */}
        <AnimatePresence>
          {notification && (
            <motion.div 
              initial={{ opacity: 0, y: 50, x: '-50%' }}
              animate={{ opacity: 1, y: 0, x: '-50%' }}
              exit={{ opacity: 0, y: 50, x: '-50%' }}
              className={cn(
                "fixed bottom-8 left-1/2 z-[100] px-8 py-4 rounded-3xl shadow-[0_20px_50px_rgba(0,0,0,0.3)] flex items-center gap-4 backdrop-blur-2xl border font-bold text-base min-w-[320px] justify-center",
                notification.type === 'success' ? "bg-emerald-500/20 border-emerald-500/30 text-emerald-400 shadow-emerald-500/10" : 
                notification.type === 'error' ? "bg-red-500/20 border-red-500/30 text-red-400 shadow-red-500/10" :
                "bg-brand-primary/20 border-brand-primary/30 text-brand-primary shadow-brand-primary/10"
              )}
            >
              <div className={cn(
                "w-8 h-8 rounded-full flex items-center justify-center",
                notification.type === 'success' ? "bg-emerald-500/20" : 
                notification.type === 'error' ? "bg-red-500/20" : "bg-brand-primary/20"
              )}>
                {notification.type === 'success' ? <CheckCircle2 className="w-5 h-5" /> : 
                 notification.type === 'error' ? <AlertCircle className="w-5 h-5" /> : 
                 <Info className="w-5 h-5" />}
              </div>
              {notification.message}
            </motion.div>
          )}
        </AnimatePresence>

        {/* Background Glows */}
        <div className="absolute top-[-10%] left-[-10%] w-[50%] h-[50%] bg-brand-secondary/20 blur-[120px] rounded-full pointer-events-none" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[50%] h-[50%] bg-brand-primary/10 blur-[120px] rounded-full pointer-events-none" />

        {/* Left Side: Branding & Features (Desktop) */}
        <div className="hidden md:flex flex-1 flex-col justify-between p-12 lg:p-20 relative z-10">
          <div className="w-16 h-16 bg-brand-primary rounded-2xl flex items-center justify-center rotate-6 shadow-[0_0_30px_rgba(204,255,0,0.3)]">
            <Zap className="w-10 h-10 text-black fill-current" />
          </div>

          <div className="space-y-12 max-w-2xl">
            <div className="space-y-6">
              <h1 className="text-7xl lg:text-8xl font-black tracking-tighter leading-[0.85] uppercase">
                Fuel Your<br />
                <span className="text-brand-primary">Potential</span>
              </h1>
              <p className="text-xl text-text-muted font-medium leading-relaxed max-w-md">
                The AI-powered health companion that understands your body and helps you reach peak performance.
              </p>
            </div>

            <div className="flex gap-12">
              {[
                { label: "AI Analysis", value: "Instant" },
                { label: "Tracking", value: "Real-time" },
                { label: "Support", value: "24/7" }
              ].map((stat, i) => (
                <div key={i} className="space-y-1">
                  <p className="text-[10px] font-black uppercase tracking-widest text-text-muted">{stat.label}</p>
                  <p className="text-xl font-bold text-white">{stat.value}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="flex items-center gap-4 text-[10px] font-black uppercase tracking-[0.2em] text-text-muted/50">
            <span>© 2026 CALTHY AI</span>
            <div className="w-1 h-1 rounded-full bg-brand-primary" />
            <span>Built for Athletes</span>
          </div>
        </div>

        {/* Right Side: Login/Onboarding Form */}
        <div className={cn("flex-1 flex flex-col justify-center items-center p-8 relative z-10 border-l transition-colors duration-500 overflow-y-auto",
          theme === 'dark' ? "bg-[#050505] border-white/5" : "bg-white border-slate-200"
        )}>
          {authMode === 'onboarding' ? (
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="w-full max-w-md space-y-10 py-12"
            >
              <div className="space-y-4">
                <h2 className="text-5xl font-black tracking-tight uppercase leading-none">
                  Setup Profile<span className="text-brand-primary">.</span>
                </h2>
                <p className="text-lg text-text-muted font-medium">
                  Let's personalize your experience.
                </p>
              </div>

              <form onSubmit={handleOnboardingSubmit} className="space-y-8">
                <div className="space-y-8">
                  {/* Name Block */}
                  <div className="space-y-3">
                    <label className="text-[10px] font-black uppercase tracking-widest text-text-muted">Username (Compulsory)</label>
                    <input 
                      type="text"
                      placeholder="Enter your username"
                      required
                      value={onboardingData.name}
                      onChange={e => setOnboardingData({...onboardingData, name: e.target.value})}
                      className={cn(
                        "w-full border rounded-2xl px-6 py-5 text-lg font-bold transition-all focus:outline-none focus:border-brand-primary",
                        theme === 'dark' ? "bg-white/5 border-white/10 text-white placeholder:text-white/20" : "bg-slate-100 border-slate-200 text-slate-900 placeholder:text-slate-400"
                      )}
                    />
                  </div>

                  {/* Age Block */}
                  <div className="space-y-3">
                    <label className="text-[10px] font-black uppercase tracking-widest text-text-muted">Age (Compulsory)</label>
                    <input 
                      type="number"
                      placeholder="Enter your age"
                      required
                      value={onboardingData.age}
                      onChange={e => setOnboardingData({...onboardingData, age: e.target.value})}
                      className={cn(
                        "w-full border rounded-2xl px-6 py-5 text-lg font-bold transition-all focus:outline-none focus:border-brand-primary",
                        theme === 'dark' ? "bg-white/5 border-white/10 text-white placeholder:text-white/20" : "bg-slate-100 border-slate-200 text-slate-900 placeholder:text-slate-400"
                      )}
                    />
                  </div>

                  {/* Physical Stats Block */}
                  <div className="space-y-3">
                    <label className="text-[10px] font-black uppercase tracking-widest text-text-muted">Physical Stats (Compulsory)</label>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <input 
                          type="number"
                          placeholder="Height (cm)"
                          required
                          value={onboardingData.height}
                          onChange={e => setOnboardingData({...onboardingData, height: e.target.value})}
                          className={cn(
                            "w-full border rounded-2xl px-6 py-5 font-bold transition-all focus:outline-none focus:border-brand-primary",
                            theme === 'dark' ? "bg-white/5 border-white/10 text-white placeholder:text-white/20" : "bg-slate-100 border-slate-200 text-slate-900 placeholder:text-slate-400"
                          )}
                        />
                      </div>
                      <div className="space-y-2">
                        <input 
                          type="number"
                          placeholder="Weight (kg)"
                          required
                          value={onboardingData.weight}
                          onChange={e => setOnboardingData({...onboardingData, weight: e.target.value})}
                          className={cn(
                            "w-full border rounded-2xl px-6 py-5 font-bold transition-all focus:outline-none focus:border-brand-primary",
                            theme === 'dark' ? "bg-white/5 border-white/10 text-white placeholder:text-white/20" : "bg-slate-100 border-slate-200 text-slate-900 placeholder:text-slate-400"
                          )}
                        />
                      </div>
                    </div>
                  </div>

                  {/* Goal Selection Block */}
                  <div className="space-y-3">
                    <label className="text-[10px] font-black uppercase tracking-widest text-text-muted">Your Fitness Goal</label>
                    <div className="grid grid-cols-3 gap-3">
                      {['loss', 'maintain', 'gain'].map((g) => (
                        <button
                          key={g}
                          type="button"
                          onClick={() => setOnboardingData({...onboardingData, goal: g as any})}
                          className={cn(
                            "py-4 rounded-2xl text-[10px] font-black uppercase tracking-widest border transition-all",
                            onboardingData.goal === g 
                              ? "bg-brand-primary text-black border-brand-primary shadow-[0_0_20px_rgba(204,255,0,0.2)]" 
                              : theme === 'dark' 
                                ? "bg-white/5 text-text-muted border-white/10 hover:border-white/20" 
                                : "bg-slate-100 text-slate-500 border-slate-200 hover:border-slate-300"
                          )}
                        >
                          {g}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Theme Selection Block */}
                  <div className="space-y-3">
                    <label className="text-[10px] font-black uppercase tracking-widest text-text-muted">Appearance</label>
                    <div className="grid grid-cols-2 gap-3">
                      {['dark', 'light'].map((t) => (
                        <button
                          key={t}
                          type="button"
                          onClick={() => {
                            setOnboardingData({...onboardingData, theme: t as any});
                            setTheme(t as any);
                          }}
                          className={cn(
                            "py-4 rounded-2xl text-[10px] font-black uppercase tracking-widest border transition-all flex items-center justify-center gap-2",
                            onboardingData.theme === t 
                              ? "bg-brand-primary text-black border-brand-primary shadow-[0_0_20px_rgba(204,255,0,0.2)]" 
                              : theme === 'dark' 
                                ? "bg-white/5 text-text-muted border-white/10 hover:border-white/20" 
                                : "bg-slate-100 text-slate-500 border-slate-200 hover:border-slate-300"
                          )}
                        >
                          {t === 'dark' ? <Moon className="w-3 h-3" /> : <Sun className="w-3 h-3" />}
                          {t}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                <button 
                  type="submit"
                  className="w-full bg-brand-primary text-black py-6 rounded-2xl font-black text-lg transition-all active:scale-95 shadow-[0_0_30px_rgba(204,255,0,0.3)] hover:scale-[1.02]"
                >
                  Complete Setup
                </button>
              </form>
            </motion.div>
          ) : (
            <motion.div 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="w-full max-w-sm space-y-16"
            >
              <div className="text-center md:text-left space-y-4">
                <div className="md:hidden w-16 h-16 bg-brand-primary rounded-2xl flex items-center justify-center mx-auto rotate-6 mb-12 shadow-[0_0_30px_rgba(204,255,0,0.3)]">
                  <Zap className="w-10 h-10 text-black fill-current" />
                </div>
                <h2 className="text-5xl font-black tracking-tight uppercase leading-none">
                  {authMode === 'login' ? 'Welcome' : 'Join Us'}
                  <span className="text-brand-primary">.</span>
                </h2>
                <p className="text-lg text-text-muted font-medium">
                  {authMode === 'login' 
                    ? 'Sign in to your dashboard.' 
                    : 'Start your peak performance journey.'}
                </p>
              </div>

              <div className="space-y-8">
                {loginError && (
                  <div className="bg-red-500/10 border border-red-500/20 text-red-400 p-4 rounded-2xl text-sm font-medium space-y-3">
                    <p>{loginError}</p>
                    {loginError.includes('refresh') && (
                      <button 
                        onClick={() => window.location.reload()}
                        className="text-[10px] font-black uppercase tracking-widest bg-red-500/20 px-4 py-2 rounded-full hover:bg-red-500/30 transition-colors"
                      >
                        Refresh Page
                      </button>
                    )}
                  </div>
                )}

                <div className="space-y-4">
                  <button 
                    onClick={handleGoogleLogin}
                    disabled={isLoggingIn}
                    className={cn(
                      "w-full bg-white text-black py-6 rounded-2xl font-black text-lg flex items-center justify-center gap-4 transition-all active:scale-95 shadow-2xl shadow-white/5",
                      isLoggingIn ? "opacity-50 cursor-not-allowed" : "hover:bg-brand-primary hover:scale-[1.02]"
                    )}
                  >
                    {isLoggingIn ? (
                      <div className="w-6 h-6 border-2 border-black border-t-transparent rounded-full animate-spin" />
                    ) : (
                      <>
                        <img src="https://www.google.com/favicon.ico" className="w-5 h-5" alt="Google" />
                        Continue with Google
                      </>
                    )}
                  </button>

                  <button 
                    onClick={() => setAuthMode(authMode === 'login' ? 'signup' : 'login')}
                    className="w-full py-4 rounded-2xl font-black text-[10px] uppercase tracking-[0.2em] text-text-muted hover:text-white transition-colors border border-white/5 hover:bg-white/5"
                  >
                    {authMode === 'login' 
                      ? "Create an account" 
                      : "Back to login"}
                  </button>
                </div>
              </div>
            </motion.div>
          )}
        </div>
      </div>
    );
  }

  return (
    <ErrorBoundary>
      <div className={cn("min-h-screen bg-bg-main text-text-main transition-colors duration-500", theme)}>
      
      {/* Toast Notification */}
      <AnimatePresence>
        {notification && (
          <motion.div 
            initial={{ opacity: 0, y: 50, x: '-50%' }}
            animate={{ opacity: 1, y: 0, x: '-50%' }}
            exit={{ opacity: 0, y: 50, x: '-50%' }}
            className={cn(
              "fixed bottom-8 left-1/2 z-[100] px-8 py-4 rounded-3xl shadow-[0_20px_50px_rgba(0,0,0,0.3)] flex items-center gap-4 backdrop-blur-2xl border font-bold text-base min-w-[320px] justify-center",
              notification.type === 'success' ? "bg-emerald-500/20 border-emerald-500/30 text-emerald-400 shadow-emerald-500/10" : 
              notification.type === 'error' ? "bg-red-500/20 border-red-500/30 text-red-400 shadow-red-500/10" :
              "bg-brand-primary/20 border-brand-primary/30 text-brand-primary shadow-brand-primary/10"
            )}
          >
            <div className={cn(
              "w-8 h-8 rounded-full flex items-center justify-center",
              notification.type === 'success' ? "bg-emerald-500/20" : 
              notification.type === 'error' ? "bg-red-500/20" : "bg-brand-primary/20"
            )}>
              {notification.type === 'success' ? <CheckCircle2 className="w-5 h-5" /> : 
               notification.type === 'error' ? <AlertCircle className="w-5 h-5" /> : 
               <Info className="w-5 h-5" />}
            </div>
            {notification.message}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Background Glows */}
      <div className="fixed top-[-10%] left-[-10%] w-[50%] h-[50%] bg-brand-secondary/10 blur-[120px] rounded-full pointer-events-none" />
      <div className="fixed bottom-[-10%] right-[-10%] w-[50%] h-[50%] bg-brand-primary/5 blur-[120px] rounded-full pointer-events-none" />

      {/* Header */}
      <header className="px-4 py-3 md:px-6 md:py-4 flex items-center justify-between sticky top-0 bg-bg-main/80 backdrop-blur-xl z-20 border-b border-border-main">
        <div className="flex items-center gap-2 md:gap-3 min-w-0">
          <div className="w-9 h-9 md:w-10 md:h-10 bg-brand-primary rounded-xl flex items-center justify-center rotate-6 shadow-[0_0_15px_rgba(204,255,0,0.2)] shrink-0">
            <Zap className="w-5 h-5 md:w-6 md:h-6 text-black fill-current" />
          </div>
          <div className="min-w-0">
            <h1 className="text-lg md:text-xl font-black tracking-tighter truncate">Calthy<span className="text-brand-primary">.</span></h1>
            <p className="text-[9px] md:text-[10px] text-text-muted font-bold uppercase tracking-widest truncate">Hey, {user?.name.split(' ')[0]} 👋</p>
          </div>
        </div>
        <div className="flex items-center gap-1.5 md:gap-2 shrink-0">
          <button 
            onClick={() => setActiveTab('chat')}
            className={cn(
              "p-2.5 md:p-3 rounded-2xl transition-colors",
              activeTab === 'chat' ? "bg-brand-primary text-black" : "bg-glass-bg hover:bg-white/10 text-text-main"
            )}
          >
            <MessageSquare className="w-5 h-5" />
          </button>
          {activeTab === 'home' && (
            <button 
              onClick={() => setActiveTab('stats')}
              className="p-2.5 md:p-3 rounded-2xl bg-glass-bg hover:bg-white/10 transition-colors"
            >
              <History className="w-5 h-5 text-text-main" />
            </button>
          )}
          {activeTab === 'stats' && (
            <button 
              onClick={() => setActiveTab('home')}
              className="p-2.5 md:p-3 rounded-2xl bg-glass-bg hover:bg-white/10 transition-colors"
            >
              <ArrowLeft className="w-5 h-5 text-text-main" />
            </button>
          )}
          <button 
            onClick={handleLogout}
            className="p-2.5 md:p-3 rounded-2xl bg-glass-bg hover:bg-red-500/20 group transition-colors"
          >
            <LogOut className="w-5 h-5 text-text-main group-hover:text-red-500" />
          </button>
        </div>
      </header>

      <main className="flex-1 px-4 md:px-6 pb-32 overflow-y-auto relative z-10">
        <AnimatePresence mode="wait">
          {activeTab === 'home' && (
            <motion.div 
              key="home"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="space-y-6 pt-4"
            >
              <div className="flex justify-between items-center gap-4">
                <h2 className="text-xl font-bold text-text-muted">{getGreeting()}, <span className="text-text-main">{user?.name.split(' ')[0]} 🥗</span></h2>
                <div className="bg-glass-bg px-2.5 py-1 rounded-full flex items-center gap-1.5 border border-border-main shrink-0">
                  <Flame className="w-3.5 h-3.5 text-orange-500 fill-orange-500" />
                  <span className="text-[10px] font-black uppercase tracking-tight">{currentStreak} DAY STREAK</span>
                </div>
              </div>

              {/* Calorie Ring */}
              <div className="flex justify-center py-4 relative">
                <AnimatePresence>
                  {activeMacro && (
                    <motion.div 
                      initial={{ opacity: 0, scale: 0.9 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.9 }}
                      style={{ 
                        left: mousePos.x, 
                        top: mousePos.y - 60,
                        transform: 'translateX(-50%)'
                      }}
                      className="absolute z-20 bg-bg-surface/90 backdrop-blur-2xl border border-border-main px-4 py-2 rounded-2xl shadow-2xl flex items-center gap-3 pointer-events-none"
                    >
                      <div className="w-2 h-2 rounded-full" style={{ backgroundColor: activeMacro.color }} />
                      <div className="flex flex-col">
                        <span className="text-[10px] font-black uppercase tracking-widest text-text-muted">{activeMacro.name}</span>
                        <span className="text-sm font-black" style={{ color: activeMacro.color }}>{activeMacro.value.toFixed(1)}g</span>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>

                <div 
                  className="relative w-64 h-64 flex items-center justify-center"
                  onMouseMove={(e) => {
                    const rect = e.currentTarget.getBoundingClientRect();
                    setMousePos({ x: e.clientX - rect.left, y: e.clientY - rect.top });
                  }}
                  onTouchMove={(e) => {
                    const rect = e.currentTarget.getBoundingClientRect();
                    const touch = e.touches[0];
                    setMousePos({ x: touch.clientX - rect.left, y: touch.clientY - rect.top });
                  }}
                >
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={pieData}
                        cx="50%"
                        cy="50%"
                        innerRadius={100}
                        outerRadius={115}
                        paddingAngle={5}
                        dataKey="kcal"
                        stroke="none"
                        startAngle={90}
                        endAngle={450}
                        onMouseEnter={(data) => {
                          if (data.name !== 'Remaining') {
                            setActiveMacro({ name: data.name, value: data.payload.value, color: data.color });
                          }
                        }}
                        onMouseLeave={() => setActiveMacro(null)}
                      >
                        {pieData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.color} className="outline-none cursor-pointer" />
                        ))}
                      </Pie>
                    </PieChart>
                  </ResponsiveContainer>
                  
                  <div className="absolute inset-0 flex flex-col items-center justify-center text-center pointer-events-none">
                    <span className="text-5xl md:text-6xl font-black tracking-tighter">{Math.max(0, calorieGoal - dailyStats.calories).toFixed(0)}</span>
                    <span className="text-[10px] md:text-sm font-bold text-text-muted uppercase tracking-widest">kcal left</span>
                    
                    {/* Macro Breakdown in Circle */}
                    <div className="mt-4 flex items-center gap-3">
                      <div className="flex flex-col items-center min-w-[45px]">
                        <span className="text-[10px] font-black text-brand-accent">{dailyStats.protein.toFixed(1)}g</span>
                        <span className="text-[8px] font-bold text-text-muted uppercase tracking-widest">Prot</span>
                      </div>
                      <div className="w-px h-6 bg-border-main" />
                      <div className="flex flex-col items-center min-w-[45px]">
                        <span className="text-[10px] font-black text-brand-primary">{dailyStats.carbs.toFixed(1)}g</span>
                        <span className="text-[8px] font-bold text-text-muted uppercase tracking-widest">Carb</span>
                      </div>
                      <div className="w-px h-6 bg-border-main" />
                      <div className="flex flex-col items-center min-w-[45px]">
                        <span className="text-[10px] font-black text-brand-secondary">{dailyStats.fats.toFixed(1)}g</span>
                        <span className="text-[8px] font-bold text-text-muted uppercase tracking-widest">Fat</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Water Tracker */}
              <div className="glass-card p-5 md:p-6 rounded-[1.5rem] md:rounded-[2rem] space-y-4">
                <div className="flex justify-between items-center">
                  <div className="flex items-center gap-2">
                    <Droplets className="w-5 h-5 text-brand-accent" />
                    <h3 className="text-lg font-bold">Water</h3>
                  </div>
                  <span className="text-xs font-bold text-text-muted">{waterGlasses}/8 glasses</span>
                </div>
                <div className="flex justify-between items-center gap-2">
                  {[...Array(8)].map((_, i) => (
                    <button 
                      key={i}
                      onClick={() => setWaterGlasses(i + 1)}
                      className={cn(
                        "w-8 h-10 rounded-lg transition-all border",
                        i < waterGlasses 
                          ? "bg-brand-accent border-brand-accent shadow-[0_0_15px_rgba(0,240,255,0.3)]" 
                          : "bg-glass-bg border-border-main"
                      )}
                    >
                      <GlassWater className={cn("w-4 h-4 mx-auto", i < waterGlasses ? "text-black" : "text-text-muted/50")} />
                    </button>
                  ))}
                  <button 
                    onClick={() => setWaterGlasses(prev => Math.min(prev + 1, 8))}
                    className="w-10 h-10 bg-glass-bg rounded-xl flex items-center justify-center border border-border-main hover:bg-white/10"
                  >
                    <Plus className="w-5 h-5" />
                  </button>
                </div>
              </div>

              {/* Quick Add */}
              <div className="space-y-4">
                <div className="flex items-center justify-between px-2">
                  <div className="flex items-center gap-2">
                    <Zap className="w-5 h-5 text-brand-primary fill-current" />
                    <h3 className="text-lg font-bold">quick add</h3>
                  </div>
                  <button 
                    onClick={() => {
                      setLogMode('search');
                      setActiveTab('log');
                    }}
                    className="text-[10px] font-black uppercase tracking-widest text-brand-primary bg-brand-primary/10 px-3 py-1.5 rounded-full border border-brand-primary/20"
                  >
                    Browse All
                  </button>
                </div>
                <div className="flex gap-4 overflow-x-auto pb-4 no-scrollbar">
                  {FOOD_DATABASE.slice(0, 6).map((food) => (
                    <button 
                      key={food.id}
                      onClick={() => handleQuickAdd(food)}
                      className="flex-shrink-0 w-32 glass-card p-4 rounded-3xl space-y-2 text-left hover:bg-white/10 transition-all active:scale-95"
                    >
                      <div className="w-10 h-10 bg-glass-bg rounded-xl flex items-center justify-center text-xl">
                        {food.category === 'Curry' ? '🥘' : food.category === 'Rice' ? '🍚' : food.category === 'Bread' ? '🫓' : '🥗'}
                      </div>
                      <div>
                        <p className="text-xs font-bold truncate">{food.name}</p>
                        <p className="text-[10px] font-black text-brand-primary">{food.calories} kcal</p>
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Today's Log */}
              <div className="space-y-4 pb-8">
                <div className="flex items-center gap-2 px-2">
                  <History className="w-5 h-5 text-text-muted" />
                  <h3 className="text-lg font-bold">today's log</h3>
                </div>
                {meals.filter(m => {
                  const mealDate = new Date(m.timestamp);
                  const today = new Date();
                  return mealDate.getDate() === today.getDate() &&
                         mealDate.getMonth() === today.getMonth() &&
                         mealDate.getFullYear() === today.getFullYear();
                }).length === 0 ? (
                  <div className="text-center py-12 glass-card rounded-[2rem] border-dashed border-2 border-border-main">
                    <p className="text-text-muted font-bold text-sm">no meals logged yet — start adding! ✨</p>
                  </div>
                ) : (
                  meals.filter(m => {
                    const mealDate = new Date(m.timestamp);
                    const today = new Date();
                    return mealDate.getDate() === today.getDate() &&
                           mealDate.getMonth() === today.getMonth() &&
                           mealDate.getFullYear() === today.getFullYear();
                  }).map((meal) => (
                    <button 
                      key={meal.id} 
                      onClick={() => setSelectedMeal(meal)}
                      className="w-full glass-card p-4 rounded-2xl flex items-center justify-between text-left hover:bg-white/5 transition-colors"
                    >
                      <div className="flex items-center gap-4">
                        <div className="w-12 h-12 bg-glass-bg rounded-xl flex items-center justify-center text-xl overflow-hidden">
                          {meal.image ? <img src={meal.image} className="w-full h-full object-cover" referrerPolicy="no-referrer" /> : '🍽️'}
                        </div>
                        <div>
                          <p className="font-bold">{meal.mealName || (meal as any).name || 'Unnamed Meal'}</p>
                          <p className="text-[10px] text-text-muted font-bold uppercase tracking-widest">{format(new Date(meal.timestamp), 'h:mm a')}</p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="font-black text-brand-primary">{Math.round(meal.calories)} kcal</p>
                      </div>
                    </button>
                  ))
                )}
              </div>
            </motion.div>
          )}

          {activeTab === 'log' && (
            <motion.div 
              key="log"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="space-y-6 pt-4"
            >
              <div className="space-y-1">
                <h2 className="text-2xl md:text-3xl font-black">log meal ✍️</h2>
                <p className="text-xs md:text-sm text-text-muted font-medium">describe, snap, or search what you ate</p>
              </div>

              <div className="grid grid-cols-4 gap-2">
                {['Breakfast', 'Lunch', 'Dinner', 'Snack'].map(type => (
                  <button 
                    key={type}
                    onClick={() => setMealType(type as any)}
                    className={cn(
                      "py-3 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all border",
                      mealType === type 
                        ? "bg-brand-primary text-black border-brand-primary" 
                        : "bg-glass-bg text-text-muted border-border-main"
                    )}
                  >
                    <div className="mb-1 text-lg">
                      {type === 'Breakfast' ? '🍳' : type === 'Lunch' ? '🍱' : type === 'Dinner' ? '🌙' : '🍿'}
                    </div>
                    {type}
                  </button>
                ))}
              </div>

              <div className="flex bg-glass-bg p-1 rounded-2xl border border-border-main">
                <button 
                  onClick={() => setLogMode('ai')}
                  className={cn(
                    "flex-1 py-3 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2",
                    logMode === 'ai' ? "bg-brand-primary text-black" : "text-text-muted"
                  )}
                >
                  <Sparkles className="w-4 h-4" />
                  AI Detect
                </button>
                <button 
                  onClick={() => setLogMode('search')}
                  className={cn(
                    "flex-1 py-3 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2",
                    logMode === 'search' ? "bg-brand-primary text-black" : "text-text-muted"
                  )}
                >
                  <Search className="w-4 h-4" />
                  Search DB
                </button>
              </div>

              {logMode === 'ai' ? (
                <div className="space-y-6">
                  <textarea 
                    placeholder="describe what you ate... e.g. 'had 2 rotis with dal tadka, a bowl of rice and some raita'"
                    className="input-field min-h-[120px] py-4 resize-none"
                    value={inputText}
                    onChange={(e) => setInputText(e.target.value)}
                  />
                  
                  <div 
                    onClick={() => fileInputRef.current?.click()}
                    className={cn(
                      "w-full aspect-video rounded-[1.5rem] md:rounded-[2rem] border-2 border-dashed flex flex-col items-center justify-center cursor-pointer transition-all overflow-hidden relative group",
                      selectedImage ? "border-brand-primary" : "border-border-main hover:border-brand-primary hover:bg-brand-primary/5"
                    )}
                  >
                    {selectedImage ? (
                      <img src={selectedImage} alt="Selected" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                    ) : (
                      <>
                        <Camera className="w-8 h-8 text-text-muted/50 mb-2" />
                        <p className="text-xs font-bold text-text-muted uppercase tracking-widest">tap to snap or upload a photo</p>
                      </>
                    )}
                    <input type="file" ref={fileInputRef} onChange={handleImageUpload} accept="image/*" className="hidden" />
                  </div>

                  <button 
                    onClick={handleAnalyze}
                    disabled={isAnalyzing || (!inputText && !selectedImage)}
                    className="btn-primary w-full py-5 text-lg shadow-[0_0_30px_rgba(204,255,0,0.2)]"
                  >
                    {isAnalyzing ? (
                      <div className="w-6 h-6 border-3 border-black/30 border-t-black rounded-full animate-spin" />
                    ) : (
                      <>
                        <Zap className="w-5 h-5 fill-current" />
                        analyze with AI
                      </>
                    )}
                  </button>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="relative">
                    <Search className="absolute left-6 top-1/2 -translate-y-1/2 w-5 h-5 text-text-muted" />
                    <input 
                      type="text" 
                      placeholder="search for a dish..." 
                      className="input-field input-with-icon"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                    />
                  </div>

                  <div className="flex gap-2 overflow-x-auto no-scrollbar pb-2">
                    {FOOD_CATEGORIES.map(cat => (
                      <button 
                        key={cat}
                        onClick={() => setSelectedCategory(cat)}
                        className={cn(
                          "px-4 py-2 rounded-full text-[10px] font-black uppercase tracking-widest whitespace-nowrap transition-all border",
                          selectedCategory === cat 
                            ? "bg-brand-primary text-black border-brand-primary" 
                            : "bg-glass-bg text-text-muted border-border-main hover:bg-white/10"
                        )}
                      >
                        {cat}
                      </button>
                    ))}
                  </div>

                  <div className="space-y-3 max-h-[400px] overflow-y-auto no-scrollbar pb-8">
                    {FOOD_DATABASE
                      .filter(f => (selectedCategory === 'All' || f.category === selectedCategory) && f.name.toLowerCase().includes(searchQuery.toLowerCase()))
                      .map(food => (
                        <div key={food.id} className="glass-card p-4 rounded-2xl flex items-center justify-between">
                          <div className="flex items-center gap-4">
                            <div className="w-10 h-10 bg-glass-bg rounded-xl flex items-center justify-center text-lg">
                              {food.category === 'Curry' ? '🥘' : food.category === 'Rice' ? '🍚' : food.category === 'Bread' ? '🫓' : '🥗'}
                            </div>
                            <div>
                              <p className="font-bold text-sm">{food.name}</p>
                              <p className="text-[10px] text-text-muted font-bold uppercase tracking-widest">{food.calories} kcal · {food.portion}</p>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <button 
                              onClick={() => setFavorites(prev => 
                                prev.includes(food.id) ? prev.filter(id => id !== food.id) : [...prev, food.id]
                              )}
                              className={cn(
                                "w-8 h-8 rounded-lg flex items-center justify-center transition-all",
                                favorites.includes(food.id) ? "bg-brand-primary/20 text-brand-primary" : "bg-glass-bg text-text-muted hover:bg-white/10"
                              )}
                            >
                              <Trophy className={cn("w-4 h-4", favorites.includes(food.id) && "fill-current")} />
                            </button>
                            <button 
                              onClick={() => handleQuickAdd(food)}
                              className="w-8 h-8 bg-glass-bg rounded-lg flex items-center justify-center text-text-muted hover:bg-brand-primary hover:text-black transition-all"
                            >
                              <Plus className="w-4 h-4" />
                            </button>
                          </div>
                        </div>
                      ))}
                  </div>
                </div>
              )}
            </motion.div>
          )}

          {activeTab === 'stats' && (
            <motion.div 
              key="stats"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="space-y-6 pt-4"
            >
              <div className="space-y-1">
                <h2 className="text-2xl md:text-3xl font-black">your stats 📊</h2>
                <p className="text-xs md:text-sm text-text-muted font-medium">this week's overview</p>
              </div>

              <div className="glass-card p-5 md:p-6 rounded-[1.5rem] md:rounded-[2rem] h-[250px] md:h-[300px] space-y-4">
                <h3 className="text-xs font-black uppercase tracking-widest text-text-muted">Weekly Calories</h3>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={weeklyData}>
                    <RechartsTooltip 
                      cursor={{ fill: 'transparent' }}
                      content={({ active, payload }) => {
                        if (active && payload && payload.length) {
                          return (
                            <div className="bg-bg-surface/90 backdrop-blur-xl border border-border-main p-2 rounded-xl shadow-2xl">
                              <p className="text-[10px] font-black uppercase tracking-widest text-text-muted">{payload[0].payload.day}</p>
                              <p className="text-sm font-black text-brand-primary">{payload[0].value} kcal</p>
                            </div>
                          );
                        }
                        return null;
                      }}
                    />
                    <XAxis dataKey="day" axisLine={false} tickLine={false} tick={{ fill: 'var(--color-text-muted)', fontSize: 10 }} />
                    <Bar 
                      dataKey="kcal" 
                      radius={[4, 4, 4, 4]} 
                      cursor="pointer"
                      onClick={(data: any) => {
                        if (data && data.date) {
                          setSelectedStatsDay(data.date);
                        }
                      }}
                    >
                      {weeklyData.map((entry, i) => (
                        <Cell 
                          key={i} 
                          fill={selectedStatsDay === entry.date ? 'var(--color-brand-primary)' : (i === 6 ? 'var(--color-brand-primary)' : 'var(--color-glass-bg)')} 
                          fillOpacity={selectedStatsDay === entry.date ? 1 : 0.6}
                        />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>

              {selectedStatsDay && (
                <motion.div 
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  className="space-y-4"
                >
                  <div className="flex items-center justify-between px-2">
                    <h3 className="text-lg font-bold">Log for {weeklyData.find(d => d.date === selectedStatsDay)?.fullDate}</h3>
                    <button 
                      onClick={() => setSelectedStatsDay(null)}
                      className="text-[10px] font-black uppercase tracking-widest text-text-muted"
                    >
                      Close
                    </button>
                  </div>
                  {selectedDayMeals.length === 0 ? (
                    <div className="text-center py-8 glass-card rounded-[2rem] border-dashed border-2 border-border-main">
                      <p className="text-text-muted font-bold text-sm">No meals logged for this day.</p>
                    </div>
                  ) : (
                    selectedDayMeals.map((meal) => (
                      <button 
                        key={meal.id} 
                        onClick={() => setSelectedMeal(meal)}
                        className="w-full glass-card p-4 rounded-2xl flex items-center justify-between text-left hover:bg-white/5 transition-colors"
                      >
                        <div className="flex items-center gap-4">
                          <div className="w-12 h-12 bg-glass-bg rounded-xl flex items-center justify-center text-xl">
                            {meal.image ? <img src={meal.image} className="w-full h-full object-cover rounded-xl" referrerPolicy="no-referrer" /> : '🍽️'}
                          </div>
                          <div>
                            <p className="font-bold">{meal.mealName || (meal as any).name || 'Unnamed Meal'}</p>
                            <p className="text-[10px] text-text-muted font-bold uppercase tracking-widest">{format(new Date(meal.timestamp), 'h:mm a')}</p>
                          </div>
                        </div>
                        <div className="text-right">
                          <p className="font-black text-brand-primary">{meal.calories} kcal</p>
                        </div>
                      </button>
                    ))
                  )}
                </motion.div>
              )}

              <div className="grid grid-cols-2 gap-4">
                <StatsCard icon={TrendingUp} label="avg daily" value={meals.length > 0 ? Math.round(meals.reduce((sum, m) => sum + m.calories, 0) / Array.from(new Set(meals.map(m => format(m.timestamp, 'yyyy-MM-dd')))).length).toLocaleString() : "0"} unit="kcal" color="text-brand-primary" />
                <StatsCard icon={Activity} label="goal hit" value={meals.length > 0 ? `${getWeeklyData().filter(d => d.kcal >= dailyGoal * 0.8 && d.kcal <= dailyGoal * 1.2).length}/7` : "0/7"} unit="days" color="text-brand-accent" />
                <StatsCard icon={Flame} label="best streak" value={bestStreak.toString()} unit="days" color="text-orange-400" />
                <StatsCard icon={Zap} label="top meal" value={meals.length > 0 ? (meals.reduce((prev, curr) => (prev.calories > curr.calories) ? prev : curr).mealName || (meals.reduce((prev, curr) => (prev.calories > curr.calories) ? prev : curr) as any).name || "Unnamed") : "None"} unit={meals.length > 0 ? `avg ${Math.round(meals.reduce((sum, m) => sum + m.calories, 0) / meals.length)} kcal` : ""} color="text-brand-secondary" />
              </div>

              {/* Run Tracker Entry */}
              <div className="glass-card p-5 md:p-6 rounded-[1.5rem] md:rounded-[2rem] space-y-4 border-brand-primary/20">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-brand-primary rounded-xl flex items-center justify-center rotate-6">
                      <Footprints className="w-6 h-6 text-black" />
                    </div>
                    <div>
                      <h3 className="text-lg font-bold">Run Tracker</h3>
                      <p className="text-[10px] text-text-muted font-bold uppercase tracking-widest">Track your cardio</p>
                    </div>
                  </div>
                  <button 
                    onClick={() => setActiveTab('run')}
                    className="btn-primary px-6 py-2 text-xs"
                  >
                    Start Run
                  </button>
                </div>
              </div>

              <div className="bg-brand-primary/10 p-5 md:p-6 rounded-[1.5rem] md:rounded-[2rem] border border-brand-primary/20 flex gap-4 items-start">
                <Sparkles className="w-6 h-6 text-brand-primary flex-shrink-0" />
                <div>
                  <p className="text-xs font-black uppercase tracking-widest text-brand-primary mb-1">AI Insight</p>
                  <p className="text-sm font-medium leading-relaxed">
                    {dailyStats.calories > calorieGoal 
                      ? "You've exceeded your calorie goal today. Try a light walk to balance it out! 🚶‍♂️" 
                      : dailyStats.protein < proteinGoal / 2 
                      ? "Your protein intake is a bit low. Consider adding some sprouts or eggs to your next meal! 🥚"
                      : "You're doing great! Keep up the consistency to reach your goals faster. 🚀"}
                  </p>
                </div>
              </div>

              {/* Diet Plan Section */}
              <div className="space-y-4">
                <div className="flex items-center justify-between px-2">
                  <div className="flex items-center gap-2">
                    <Utensils className="w-5 h-5 text-brand-secondary" />
                    <h3 className="text-lg font-bold">personalized diet plan</h3>
                  </div>
                  <button 
                    onClick={handleGenerateDietPlan}
                    disabled={isGeneratingPlan}
                    className="text-[10px] font-black uppercase tracking-widest text-brand-primary bg-brand-primary/10 px-3 py-1.5 rounded-full border border-brand-primary/20"
                  >
                    {isGeneratingPlan ? 'Generating...' : 'Regenerate'}
                  </button>
                </div>

                {!dietPlan ? (
                  <div className="glass-card p-8 rounded-[2rem] text-center space-y-4">
                    <div className="w-16 h-16 bg-glass-bg rounded-2xl flex items-center justify-center mx-auto">
                      <Zap className="w-8 h-8 text-text-muted/50" />
                    </div>
                    <p className="text-sm text-text-muted font-medium">Get a custom Indian diet plan based on your profile and goals.</p>
                    <button 
                      onClick={handleGenerateDietPlan}
                      disabled={isGeneratingPlan}
                      className="btn-primary w-full py-4 text-sm"
                    >
                      {isGeneratingPlan ? 'Generating Plan...' : 'Generate My Plan'}
                    </button>
                  </div>
                ) : (
                  <div className="space-y-4">
                    <div className="glass-card p-6 rounded-[2rem] space-y-4 border-brand-secondary/20">
                      <div className="grid grid-cols-2 gap-4">
                        <PlanItem 
                          label="Breakfast" 
                          meal={dietPlan.breakfast} 
                          onClick={() => setSelectedMeal({ ...dietPlan.breakfast, id: 'breakfast', timestamp: Date.now() })} 
                        />
                        <PlanItem 
                          label="Lunch" 
                          meal={dietPlan.lunch} 
                          onClick={() => setSelectedMeal({ ...dietPlan.lunch, id: 'lunch', timestamp: Date.now() })} 
                        />
                        <PlanItem 
                          label="Snacks" 
                          meal={dietPlan.snacks} 
                          onClick={() => setSelectedMeal({ ...dietPlan.snacks, id: 'snacks', timestamp: Date.now() })} 
                        />
                        <PlanItem 
                          label="Dinner" 
                          meal={dietPlan.dinner} 
                          onClick={() => setSelectedMeal({ ...dietPlan.dinner, id: 'dinner', timestamp: Date.now() })} 
                        />
                      </div>
                      <div className="pt-4 border-t border-border-main">
                        <p className="text-[10px] font-black uppercase tracking-widest text-text-muted mb-2">Why this works</p>
                        <p className="text-xs text-text-main/60 leading-relaxed italic">"{dietPlan.rationale}"</p>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Recent Activities */}
              <div className="space-y-4 pb-8">
                <div className="flex items-center gap-2 px-2">
                  <Footprints className="w-5 h-5 text-brand-primary" />
                  <h3 className="text-lg font-bold">recent activities</h3>
                </div>
                {activities.length === 0 ? (
                  <div className="text-center py-12 glass-card rounded-[2rem] border-dashed border-2 border-border-main">
                    <p className="text-text-muted font-bold text-sm">no activities tracked yet 👟</p>
                  </div>
                ) : (
                  activities.map((activity) => (
                    <div key={activity.id} className="glass-card p-4 rounded-2xl flex items-center justify-between">
                      <div className="flex items-center gap-4">
                        <div className="w-12 h-12 bg-glass-bg rounded-xl flex items-center justify-center text-xl overflow-hidden">
                          {activity.type === 'run' && activity.path && activity.path.length > 0 ? (
                            <svg viewBox="-5 -5 110 110" className="w-full h-full p-1">
                              <polyline
                                points={activity.path.map((p, i, arr) => {
                                  const lats = arr.map(p => p.lat);
                                  const lngs = arr.map(p => p.lng);
                                  const minLat = Math.min(...lats);
                                  const maxLat = Math.max(...lats);
                                  const minLng = Math.min(...lngs);
                                  const maxLng = Math.max(...lngs);
                                  const rangeLat = Math.max(maxLat - minLat, 0.0001);
                                  const rangeLng = Math.max(maxLng - minLng, 0.0001);
                                  const x = ((p.lng - minLng) / rangeLng) * 100;
                                  const y = 100 - ((p.lat - minLat) / rangeLat) * 100;
                                  return `${x},${y}`;
                                }).join(' ')}
                                fill="none"
                                stroke="#CCFF00"
                                strokeWidth="8"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                              />
                            </svg>
                          ) : (
                            activity.type === 'run' ? '🏃‍♂️' : '🥗'
                          )}
                        </div>
                        <div>
                          <p className="font-bold">{activity.type === 'run' ? 'Morning Run' : 'Meal Logged'}</p>
                          <p className="text-[10px] text-text-muted font-bold uppercase tracking-widest">
                            {format(new Date(activity.timestamp), 'MMM d, h:mm a')} {activity.type === 'run' && `· ${activity.distance.toFixed(2)} km`}
                          </p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="font-black text-brand-primary">{activity.calories.toFixed(0)} kcal</p>
                        {activity.type === 'run' && (
                          <p className="text-[10px] font-bold text-text-muted uppercase">{Math.floor(activity.time / 60)}m {activity.time % 60}s</p>
                        )}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </motion.div>
          )}

          {activeTab === 'profile' && (
            <motion.div 
              key="profile"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="space-y-6 pt-4"
            >
              <h2 className="text-2xl md:text-3xl font-black">profile 👤</h2>
              
              <div className="glass-card p-5 md:p-6 rounded-[2rem] md:rounded-[2.5rem] space-y-6">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className="w-16 h-16 bg-brand-primary rounded-2xl flex items-center justify-center text-3xl">
                      👤
                    </div>
                    <div>
                      <h3 className="text-xl font-black">{user?.name}</h3>
                      <p className="text-[10px] text-text-muted font-bold uppercase tracking-widest">🎯 Goal: {user?.goal === 'loss' ? 'Weight Loss' : user?.goal === 'gain' ? 'Weight Gain' : 'Maintain'}</p>
                      <div className="flex items-center gap-2 mt-1">
                        <div className="w-2 h-2 bg-brand-primary rounded-full animate-pulse" />
                        <span className="text-[10px] font-bold text-brand-primary uppercase tracking-widest">Active Lifestyle</span>
                      </div>
                    </div>
                  </div>
                  <button 
                    onClick={() => setIsEditingProfile(true)}
                    className="p-3 bg-glass-bg hover:bg-white/10 rounded-2xl transition-colors"
                  >
                    <Settings className="w-5 h-5 text-text-muted" />
                  </button>
                </div>

                <div className="grid grid-cols-3 gap-3">
                  <div className="bg-glass-bg p-4 rounded-3xl text-center border border-border-main">
                    <Utensils className="w-4 h-4 mx-auto mb-2 text-orange-400" />
                    <p className="text-lg font-black">{user?.weight} kg</p>
                    <p className="text-[8px] text-text-muted uppercase font-black">Weight</p>
                  </div>
                  <div className="bg-glass-bg p-4 rounded-3xl text-center border border-border-main">
                    <TrendingUp className="w-4 h-4 mx-auto mb-2 text-brand-primary" />
                    <p className="text-lg font-black">{user?.height} cm</p>
                    <p className="text-[8px] text-text-muted uppercase font-black">Height</p>
                  </div>
                  <div className="bg-glass-bg p-4 rounded-3xl text-center border border-border-main">
                    <Activity className="w-4 h-4 mx-auto mb-2 text-brand-accent" />
                    <p className="text-lg font-black">{user?.age}</p>
                    <p className="text-[8px] text-text-muted uppercase font-black">Age</p>
                  </div>
                </div>
              </div>

              <div className="space-y-3">
                <ProfileMenuItem 
                  icon={theme === 'dark' ? Moon : Sun} 
                  label="Theme" 
                  sub={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`} 
                  onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')} 
                />
                <ProfileMenuItem icon={TrendingUp} label="Daily Goals" sub="Customize calorie & macro targets" onClick={() => setIsEditingProfile(true)} />
                <ProfileMenuItem icon={AlertCircle} label="Reminders" sub="Meal & water notifications" onClick={() => setShowRemindersModal(true)} />
                <ProfileMenuItem icon={Trophy} label="Favorites" sub="Your saved dishes" onClick={() => setActiveTab('favorites')} />
                <ProfileMenuItem icon={Zap} label="Fasting Mode" sub="Intermittent fasting tracker" onClick={() => setActiveTab('fasting')} />
                <ProfileMenuItem icon={Info} label="About" sub="App info & feedback" onClick={() => setShowAboutModal(true)} />
              </div>

              <button 
                onClick={handleLogout}
                className="w-full p-5 rounded-[2rem] bg-red-500/10 border border-red-500/20 text-red-500 font-black uppercase tracking-widest text-xs flex items-center justify-center gap-3 hover:bg-red-500/20 transition-all"
              >
                <LogOut className="w-4 h-4" />
                Sign Out
              </button>
            </motion.div>
          )}
          {activeTab === 'run' && (
            <motion.div 
              key="run"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="flex flex-col pt-4"
            >
              <div className="space-y-1 mb-6">
                <h2 className="text-2xl md:text-3xl font-black">run tracker 👟</h2>
                <p className="text-xs md:text-sm text-text-muted font-medium">track your activities like a pro</p>
              </div>
              <RunTracker 
                userWeight={user?.weight || 70} 
                uid={firebaseUser?.uid || ''}
              />

              {/* Run History */}
              <div className="mt-8 space-y-4 pb-20">
                <div className="flex items-center justify-between px-2">
                  <h3 className="text-lg font-bold">run history</h3>
                  <p className="text-[10px] font-bold text-text-muted uppercase tracking-widest">
                    {activities.filter(a => a.type === 'run').length} total runs
                  </p>
                </div>
                {activities.filter(a => a.type === 'run').length === 0 ? (
                  <div className="text-center py-8 glass-card rounded-[2rem] border-dashed border-2 border-border-main">
                    <p className="text-text-muted font-bold text-sm">no runs recorded yet 👟</p>
                  </div>
                ) : (
                  activities.filter(a => a.type === 'run').map((activity) => (
                    <div key={activity.id} className="glass-card p-4 rounded-2xl flex items-center justify-between">
                      <div className="flex items-center gap-4">
                        <div className="w-12 h-12 bg-glass-bg rounded-xl flex items-center justify-center overflow-hidden">
                          {activity.path && activity.path.length > 0 ? (
                            <svg viewBox="-5 -5 110 110" className="w-full h-full p-1">
                              <polyline
                                points={activity.path.map((p, i, arr) => {
                                  const lats = arr.map(p => p.lat);
                                  const lngs = arr.map(p => p.lng);
                                  const minLat = Math.min(...lats);
                                  const maxLat = Math.max(...lats);
                                  const minLng = Math.min(...lngs);
                                  const maxLng = Math.max(...lngs);
                                  const rangeLat = Math.max(maxLat - minLat, 0.0001);
                                  const rangeLng = Math.max(maxLng - minLng, 0.0001);
                                  const x = ((p.lng - minLng) / rangeLng) * 100;
                                  const y = 100 - ((p.lat - minLat) / rangeLat) * 100;
                                  return `${x},${y}`;
                                }).join(' ')}
                                fill="none"
                                stroke="#CCFF00"
                                strokeWidth="8"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                              />
                            </svg>
                          ) : (
                            <Footprints className="w-6 h-6 text-brand-primary" />
                          )}
                        </div>
                        <div>
                          <p className="font-bold text-sm">Run Session</p>
                          <p className="text-[10px] text-text-muted font-bold uppercase tracking-widest">
                            {format(new Date(activity.timestamp), 'MMM d, h:mm a')}
                          </p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="font-black text-brand-primary text-sm">{activity.distance.toFixed(2)} km</p>
                        <p className="text-[10px] font-bold text-text-muted uppercase">{Math.floor(activity.time / 60)}m {activity.time % 60}s</p>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </motion.div>
          )}

          {activeTab === 'chat' && (
            <motion.div 
              key="chat"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="flex flex-col h-[calc(100vh-180px)] pt-4"
            >
              <div className="space-y-1 mb-6">
                <h2 className="text-2xl md:text-3xl font-black">AI assistant 🤖</h2>
                <p className="text-xs md:text-sm text-text-muted font-medium">ask anything about your health or diet</p>
              </div>

              <div className="flex-1 overflow-y-auto space-y-4 pr-2 no-scrollbar mb-4">
                {chatMessages.length === 0 ? (
                  <div className="h-full flex flex-col items-center justify-center text-center p-8 space-y-4">
                    <div className="w-20 h-20 bg-brand-primary/10 rounded-[2rem] flex items-center justify-center rotate-6">
                      <Sparkles className="w-10 h-10 text-brand-primary" />
                    </div>
                    <div>
                      <p className="text-lg font-black">How can I help today?</p>
                      <p className="text-sm text-text-muted">Try: "What's a healthy Indian breakfast?" or "Analyze my weekly progress."</p>
                    </div>
                  </div>
                ) : (
                  chatMessages.map((msg, i) => (
                    <div 
                      key={i}
                      className={cn(
                        "max-w-[85%] p-4 rounded-3xl text-sm font-medium leading-relaxed",
                        msg.role === 'user' 
                          ? "bg-brand-primary text-black ml-auto rounded-tr-none" 
                          : "bg-glass-bg text-text-main mr-auto rounded-tl-none border border-border-main"
                      )}
                    >
                      {msg.content}
                    </div>
                  ))
                )}
                {isChatting && (
                  <div className="bg-glass-bg text-text-main mr-auto rounded-3xl rounded-tl-none border border-border-main p-4 flex gap-1">
                    <div className="w-1.5 h-1.5 bg-text-muted rounded-full animate-bounce" />
                    <div className="w-1.5 h-1.5 bg-text-muted rounded-full animate-bounce [animation-delay:0.2s]" />
                    <div className="w-1.5 h-1.5 bg-text-muted rounded-full animate-bounce [animation-delay:0.4s]" />
                  </div>
                )}
                {isGeneratingVoice && (
                  <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-brand-primary animate-pulse ml-4">
                    <Volume2 className="w-3 h-3" />
                    Generating Voice...
                  </div>
                )}
              </div>

              <div className="relative mt-auto pb-4 flex items-center gap-2">
                <input 
                  type="text"
                  placeholder="Type your message..."
                  className="input-field"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      handleSendMessage((e.target as HTMLInputElement).value);
                      (e.target as HTMLInputElement).value = '';
                    }
                  }}
                />
                <button 
                  onClick={(e) => {
                    const input = e.currentTarget.previousElementSibling as HTMLInputElement;
                    handleSendMessage(input.value);
                    input.value = '';
                  }}
                  className="flex-shrink-0 w-12 h-12 bg-brand-primary rounded-2xl flex items-center justify-center text-black shadow-lg hover:scale-105 transition-all active:scale-95"
                >
                  <ArrowUp className="w-6 h-6" />
                </button>
              </div>
            </motion.div>
          )}
          {activeTab === 'fasting' && (
            <motion.div 
              key="fasting"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="flex flex-col pt-4"
            >
              <div className="flex items-center gap-4 mb-6">
                <button onClick={() => setActiveTab('profile')} className="p-2 bg-glass-bg rounded-xl">
                  <ArrowLeft className="w-5 h-5" />
                </button>
                <div>
                  <h2 className="text-2xl font-black">fasting mode ⏳</h2>
                  <p className="text-xs text-text-muted font-medium">intermittent fasting tracker</p>
                </div>
              </div>

              <div className="flex-1 flex flex-col items-center space-y-8 py-4">
                <div className="relative w-64 h-64 flex items-center justify-center">
                  <svg className="w-full h-full -rotate-90">
                    <circle cx="128" cy="128" r="110" fill="none" stroke="currentColor" strokeWidth="12" className="text-glass-bg" />
                    <motion.circle 
                      cx="128" cy="128" r="110" fill="none" stroke="currentColor" strokeWidth="12" 
                      strokeDasharray="691"
                      strokeDashoffset={691 * (1 - (fasting.isActive ? (fasting.duration - fastingTimeLeft) / fasting.duration : 0))}
                      strokeLinecap="round"
                      className="text-brand-primary"
                    />
                  </svg>
                  <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
                    <p className="text-4xl font-black">
                      {fasting.isActive 
                        ? `${Math.floor(fastingTimeLeft)}h ${Math.floor((fastingTimeLeft % 1) * 60)}m`
                        : `${fasting.duration}:00`}
                    </p>
                    <p className="text-xs font-bold text-text-muted uppercase tracking-widest">
                      {fasting.isActive ? 'Time Left' : 'Target'}
                    </p>
                  </div>
                </div>

                <div className="w-full space-y-6">
                    <div className="glass-card p-6 rounded-[2rem] space-y-6">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-xs font-black uppercase tracking-widest text-text-muted mb-1">Duration</p>
                          <p className="text-xl font-black">{fasting.duration} Hours</p>
                        </div>
                        <div className="flex gap-2">
                          {[12, 16, 18, 20].map(d => (
                            <button 
                              key={d}
                              disabled={fasting.isActive}
                              onClick={() => setFasting(prev => ({ ...prev, duration: d }))}
                              className={cn(
                                "w-10 h-10 rounded-xl font-bold transition-all",
                                fasting.duration === d ? "bg-brand-primary text-black" : "bg-glass-bg text-text-muted border border-border-main"
                              )}
                            >
                              {d}
                            </button>
                          ))}
                        </div>
                      </div>
                      
                      <div className="space-y-3">
                        <div className="flex justify-between text-[10px] font-bold uppercase tracking-widest text-text-muted">
                          <span>Custom Goal</span>
                          <span>{fasting.duration}h</span>
                        </div>
                        <input 
                          type="range" 
                          min="1" 
                          max="48" 
                          step="1"
                          disabled={fasting.isActive}
                          value={fasting.duration}
                          onChange={(e) => setFasting(prev => ({ ...prev, duration: parseInt(e.target.value) }))}
                          className="w-full h-2 bg-glass-bg rounded-lg appearance-none cursor-pointer accent-brand-primary"
                        />
                        <div className="flex justify-between text-[8px] font-bold text-text-muted/50 uppercase">
                          <span>1 hour</span>
                          <span>48 hours</span>
                        </div>
                      </div>
                    </div>

                    <button 
                      onClick={handleFastingToggle}
                      className={cn(
                        "w-full py-5 rounded-[2rem] text-xl font-black uppercase tracking-widest transition-all",
                        fasting.isActive 
                          ? "bg-red-500/10 text-red-500 border border-red-500/20" 
                          : "bg-brand-primary text-black shadow-[0_0_40px_rgba(204,255,0,0.3)]"
                      )}
                    >
                      {fasting.isActive ? 'End Fast' : 'Start Fast'}
                    </button>
                  </div>
                </div>
            </motion.div>
          )}

          {activeTab === 'favorites' && (
            <motion.div 
              key="favorites"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="flex flex-col pt-4"
            >
              <div className="flex items-center gap-4 mb-6">
                <button onClick={() => setActiveTab('profile')} className="p-2 bg-glass-bg rounded-xl">
                  <ArrowLeft className="w-5 h-5" />
                </button>
                <div>
                  <h2 className="text-2xl font-black">favorites 🏆</h2>
                  <p className="text-xs text-text-muted font-medium">your saved dishes</p>
                </div>
              </div>

              <div className="space-y-3 no-scrollbar">
                {favorites.length === 0 ? (
                  <div className="h-full flex flex-col items-center justify-center text-center p-8 space-y-4">
                    <div className="w-20 h-20 bg-glass-bg rounded-[2rem] flex items-center justify-center">
                      <Trophy className="w-10 h-10 text-text-muted" />
                    </div>
                    <p className="text-sm text-text-muted">No favorites yet. Save some dishes from the food database!</p>
                  </div>
                ) : (
                  FOOD_DATABASE.filter(f => favorites.includes(f.id)).map(food => (
                    <div key={food.id} className="glass-card p-4 rounded-3xl flex items-center justify-between">
                      <div className="flex items-center gap-4">
                        <div className="w-12 h-12 bg-glass-bg rounded-2xl flex items-center justify-center text-2xl">
                          {food.category === 'Curry' ? '🥘' : food.category === 'Rice' ? '🍚' : food.category === 'Bread' ? '🫓' : '🥗'}
                        </div>
                        <div>
                          <p className="font-bold">{food.name}</p>
                          <p className="text-[10px] text-text-muted font-black uppercase tracking-widest">{food.calories} kcal · {food.protein}g P</p>
                        </div>
                      </div>
                      <button 
                        onClick={() => setFavorites(prev => prev.filter(id => id !== food.id))}
                        className="p-2 text-red-500 hover:bg-red-500/10 rounded-xl transition-colors"
                      >
                        <LogOut className="w-4 h-4 rotate-90" />
                      </button>
                    </div>
                  ))
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      {/* Bottom Navigation Bar */}
      <nav className="fixed bottom-0 left-0 right-0 bg-bg-main/80 backdrop-blur-2xl border-t border-border-main px-2 py-2 pb-6 z-40">
        <div className="max-w-md mx-auto grid grid-cols-5 items-center">
          {[
            { id: 'home', icon: Home, label: 'Home' },
            { id: 'run', icon: Footprints, label: 'Run' },
            { id: 'log', icon: Plus, label: 'Log', isSpecial: true },
            { id: 'stats', icon: BarChart3, label: 'Stats' },
            { id: 'profile', icon: UserIcon, label: 'Profile' }
          ].map((tab) => (
            <button 
              key={tab.id}
              onClick={() => setActiveTab(tab.id as MainView)}
              className={cn(
                "flex flex-col items-center justify-center gap-1 transition-all relative w-full h-full py-1",
                activeTab === tab.id ? "text-brand-primary" : "text-text-muted hover:text-text-main"
              )}
            >
              {tab.isSpecial ? (
                <div className={cn(
                  "w-12 h-12 rounded-2xl flex items-center justify-center transition-all",
                  activeTab === tab.id 
                    ? "bg-brand-primary text-black shadow-[0_0_20px_rgba(204,255,0,0.4)]" 
                    : "bg-glass-bg text-text-main border border-border-main"
                )}>
                  <Plus className={cn("w-6 h-6", activeTab === tab.id && "rotate-90 transition-transform")} />
                </div>
              ) : (
                <>
                  <tab.icon className={cn("w-5 h-5", activeTab === tab.id && "fill-current")} />
                  <span className="text-[9px] font-black uppercase tracking-widest text-center">{tab.label}</span>
                  {activeTab === tab.id && (
                    <motion.div 
                      layoutId="nav-indicator" 
                      className="absolute -bottom-1 w-1 h-1 bg-brand-primary rounded-full" 
                    />
                  )}
                </>
              )}
            </button>
          ))}
        </div>
      </nav>

      {/* Edit Profile Modal */}
      <AnimatePresence>
        {isEditingProfile && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/80 backdrop-blur-md z-50 flex items-end sm:items-center justify-center p-4"
          >
            <motion.div 
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              className="bg-bg-surface w-full max-w-md rounded-[2rem] md:rounded-[3rem] p-6 md:p-8 space-y-8 overflow-hidden border border-border-main shadow-2xl"
            >
              <div className="flex items-center justify-between">
                <h2 className="text-2xl md:text-3xl font-black">Edit Profile<span className="text-brand-primary">.</span></h2>
                <button 
                  onClick={() => setIsEditingProfile(false)}
                  className="p-3 bg-glass-bg hover:bg-white/10 rounded-full transition-colors"
                >
                  <AlertCircle className="w-6 h-6 text-text-muted rotate-45" />
                </button>
              </div>

              <form className="space-y-6" onSubmit={(e) => {
                e.preventDefault();
                const formData = new FormData(e.currentTarget);
                handleUpdateProfile({
                  name: formData.get('name') as string,
                  email: user?.email || '',
                  age: Number(formData.get('age')),
                  weight: Number(formData.get('weight')),
                  height: Number(formData.get('height')),
                  goal: formData.get('goal') as any
                });
                setIsEditingProfile(false);
              }}>
                <div className="space-y-2">
                  <label className="text-xs font-bold uppercase tracking-widest text-text-muted ml-4">Full Name</label>
                  <input name="name" type="text" defaultValue={user?.name} className="input-field" required />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-xs font-bold uppercase tracking-widest text-text-muted ml-4">Age</label>
                    <input name="age" type="number" defaultValue={user?.age} className="input-field" required />
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-bold uppercase tracking-widest text-text-muted ml-4">Goal</label>
                    <div className="relative">
                      <select name="goal" defaultValue={user?.goal} className="input-field appearance-none pr-12" required>
                        <option value="maintain">Maintain</option>
                        <option value="loss">Weight Loss</option>
                        <option value="gain">Weight Gain</option>
                      </select>
                      <ChevronDown className="absolute right-6 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted pointer-events-none" />
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-xs font-bold uppercase tracking-widest text-text-muted ml-4">Weight (kg)</label>
                    <input name="weight" type="number" defaultValue={user?.weight} className="input-field" required />
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-bold uppercase tracking-widest text-text-muted ml-4">Height (cm)</label>
                    <input name="height" type="number" defaultValue={user?.height} className="input-field" required />
                  </div>
                </div>

                <button type="submit" className="btn-primary w-full py-5 text-xl shadow-[0_0_40px_rgba(204,255,0,0.2)]">
                  Save Changes
                </button>
              </form>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Meal Detail Modal */}
      <AnimatePresence>
        {selectedMeal && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/80 backdrop-blur-md z-50 flex items-end sm:items-center justify-center p-4"
          >
            <motion.div 
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              className="bg-bg-surface w-full max-w-md rounded-[2rem] md:rounded-[3rem] p-6 md:p-8 space-y-6 overflow-y-auto max-h-[90vh] no-scrollbar border border-border-main shadow-2xl"
            >
              <div className="flex items-center justify-between">
                <h2 className="text-xl md:text-2xl font-black">Meal Details<span className="text-brand-primary">.</span></h2>
                <button 
                  onClick={() => setSelectedMeal(null)}
                  className="p-3 bg-glass-bg hover:bg-white/10 rounded-full transition-colors"
                >
                  <AlertCircle className="w-6 h-6 text-text-muted rotate-45" />
                </button>
              </div>

              {selectedMeal.image && (
                <div className="w-full aspect-video rounded-3xl overflow-hidden">
                  <img src={selectedMeal.image} alt={selectedMeal.mealName || (selectedMeal as any).name} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                </div>
              )}

              <div className="space-y-1">
                <h3 className="text-2xl md:text-3xl font-black">{selectedMeal.mealName || (selectedMeal as any).name || 'Unnamed Meal'}</h3>
                <p className="text-xs md:text-sm text-text-muted font-medium">{format(new Date(selectedMeal.timestamp), 'MMMM d, yyyy · h:mm a')}</p>
              </div>

              <div className="grid grid-cols-4 gap-2">
                <div className="bg-glass-bg p-3 rounded-2xl text-center border border-border-main">
                  <p className="text-lg font-black text-brand-primary">{Math.round(selectedMeal.calories)}</p>
                  <p className="text-[8px] text-text-muted uppercase font-black">kcal</p>
                </div>
                <div className="bg-glass-bg p-3 rounded-2xl text-center border border-border-main">
                  <p className="text-lg font-black text-brand-accent">{selectedMeal.protein.toFixed(1)}g</p>
                  <p className="text-[8px] text-text-muted uppercase font-black">Prot</p>
                </div>
                <div className="bg-glass-bg p-3 rounded-2xl text-center border border-border-main">
                  <p className="text-lg font-black text-brand-primary">{selectedMeal.carbs.toFixed(1)}g</p>
                  <p className="text-[8px] text-text-muted uppercase font-black">Carb</p>
                </div>
                <div className="bg-glass-bg p-3 rounded-2xl text-center border border-border-main">
                  <p className="text-lg font-black text-brand-secondary">{(selectedMeal.fats || 0).toFixed(1)}g</p>
                  <p className="text-[8px] text-text-muted uppercase font-black">Fat</p>
                </div>
                {selectedMeal.cost && (
                  <div className="bg-glass-bg p-3 rounded-2xl text-center border border-border-main col-span-4">
                    <p className="text-sm font-black text-brand-primary">Estimated Cost: {selectedMeal.cost}</p>
                  </div>
                )}
              </div>

              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <Info className="w-4 h-4 text-brand-primary" />
                  <h4 className="text-xs font-black uppercase tracking-widest text-text-muted">Ingredients</h4>
                </div>
                <div className="flex flex-wrap gap-2">
                  {(selectedMeal.ingredients || []).map((ing, i) => (
                    <span key={i} className="px-3 py-1.5 bg-glass-bg border border-border-main rounded-full text-xs font-medium">
                      {ing}
                    </span>
                  ))}
                </div>
              </div>

              <div className="bg-brand-primary/10 p-6 rounded-[2rem] border border-brand-primary/20 space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-brand-primary" />
                    <span className="text-[10px] font-black uppercase tracking-widest text-brand-primary">AI Health Advice</span>
                  </div>
                  <div className="flex items-center gap-1">
                    {[...Array(10)].map((_, i) => (
                      <div key={i} className={cn("w-1 h-3 rounded-full", i < (selectedMeal.healthRating || 0) ? "bg-brand-primary" : "bg-white/10")} />
                    ))}
                  </div>
                </div>
                <p className="text-sm font-medium leading-relaxed">{selectedMeal.advice || 'No advice available.'}</p>
              </div>

              <button 
                onClick={() => setSelectedMeal(null)}
                className="btn-primary w-full py-5 text-xl"
              >
                Got it!
              </button>
            </motion.div>
          </motion.div>
        )}
        {showRemindersModal && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/80 backdrop-blur-md z-50 flex items-end sm:items-center justify-center p-4"
          >
            <motion.div 
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              className="bg-bg-surface w-full max-w-md rounded-[2rem] md:rounded-[3rem] p-6 md:p-8 space-y-6 border border-border-main shadow-2xl"
            >
              <div className="flex items-center justify-between">
                <h2 className="text-2xl font-black">Reminders 🔔</h2>
                <div className="flex gap-2">
                  <button 
                    onClick={() => setIsMuted(!isMuted)}
                    className={cn(
                      "p-3 rounded-full transition-colors",
                      isMuted ? "bg-red-500/10 text-red-500" : "bg-brand-primary/10 text-brand-primary"
                    )}
                    title={isMuted ? "Unmute Notifications" : "Mute Notifications"}
                  >
                    {isMuted ? <VolumeX className="w-5 h-5" /> : <Volume2 className="w-5 h-5" />}
                  </button>
                  <button 
                    onClick={() => setShowRemindersModal(false)}
                    className="p-3 bg-glass-bg hover:bg-white/10 rounded-full transition-colors"
                  >
                    <AlertCircle className="w-6 h-6 text-text-muted rotate-45" />
                  </button>
                </div>
              </div>

              {notificationPermission === 'denied' && (
                <div className="bg-red-500/10 border border-red-500/20 p-4 rounded-2xl flex items-start gap-3">
                  <AlertCircle className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
                  <div>
                    <p className="text-xs font-bold text-red-500 uppercase tracking-widest">Notifications Blocked</p>
                    <p className="text-[10px] text-red-500/80 font-medium">Please enable notifications in your browser settings to receive reminders.</p>
                  </div>
                </div>
              )}

              {notificationPermission === 'default' && (
                <button 
                  onClick={() => Notification.requestPermission().then(setNotificationPermission)}
                  className="w-full py-3 bg-brand-primary/10 border border-brand-primary/20 rounded-2xl text-brand-primary text-xs font-bold uppercase tracking-widest hover:bg-brand-primary/20 transition-all"
                >
                  Enable Notifications
                </button>
              )}

              <div className="space-y-3">
                {reminders.map(reminder => (
                  <div key={reminder.id} className="glass-card p-4 rounded-2xl flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <div className="w-10 h-10 bg-glass-bg rounded-xl flex items-center justify-center">
                        <AlertCircle className="w-5 h-5 text-brand-primary" />
                      </div>
                      <div>
                        <p className="font-bold">{reminder.label}</p>
                        <input 
                          type="time" 
                          value={reminder.time}
                          onChange={async (e) => {
                            const newTime = e.target.value;
                            setReminders(prev => prev.map(r => r.id === reminder.id ? { ...r, time: newTime } : r));
                            if (firebaseUser) {
                              try {
                                await setDoc(doc(db, 'users', firebaseUser.uid, 'reminders', reminder.id), { time: newTime }, { merge: true });
                              } catch (error) {
                                handleFirestoreError(error, OperationType.UPDATE, `users/${firebaseUser.uid}/reminders/${reminder.id}`);
                              }
                            }
                          }}
                          className="bg-white/5 px-2 py-0.5 rounded-md text-[10px] text-brand-primary font-black uppercase tracking-widest outline-none border border-border-main/50 cursor-pointer hover:bg-white/10 transition-all"
                        />
                      </div>
                    </div>
                    <button 
                      onClick={() => handleToggleReminder(reminder.id)}
                      className={cn(
                        "w-12 h-6 rounded-full transition-all relative",
                        reminder.enabled ? "bg-brand-primary" : "bg-glass-bg border border-border-main"
                      )}
                    >
                      <div className={cn(
                        "absolute top-1 w-4 h-4 rounded-full transition-all",
                        reminder.enabled ? "right-1 bg-black" : "left-1 bg-text-muted"
                      )} />
                    </button>
                  </div>
                ))}
              </div>

              <button 
                onClick={() => setShowRemindersModal(false)}
                className="btn-primary w-full py-5 text-xl"
              >
                Save Settings
              </button>
            </motion.div>
          </motion.div>
        )}

        {showAboutModal && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/80 backdrop-blur-md z-50 flex items-end sm:items-center justify-center p-4"
          >
            <motion.div 
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              className="bg-bg-surface w-full max-w-md rounded-[2rem] md:rounded-[3rem] p-6 md:p-8 space-y-6 border border-border-main shadow-2xl"
            >
              <div className="flex items-center justify-between">
                <h2 className="text-2xl font-black">About Calthy 🥗</h2>
                <button 
                  onClick={() => setShowAboutModal(false)}
                  className="p-3 bg-glass-bg hover:bg-white/10 rounded-full transition-colors"
                >
                  <AlertCircle className="w-6 h-6 text-text-muted rotate-45" />
                </button>
              </div>

              <div className="space-y-4 text-center py-4">
                <div className="w-24 h-24 bg-brand-primary/10 rounded-[2.5rem] flex items-center justify-center mx-auto rotate-6">
                  <Sparkles className="w-12 h-12 text-brand-primary" />
                </div>
                <div>
                  <h3 className="text-2xl font-black">Calthy v1.0.0</h3>
                  <p className="text-sm text-text-muted">Your AI-Powered Health Companion</p>
                </div>
                <p className="text-sm leading-relaxed text-text-muted">
                  Calthy uses advanced AI to help you track your nutrition, activities, and fasting goals. 
                  Snap a photo of your meal and let our AI do the work.
                </p>
                <div className="flex justify-center gap-4">
                  <div className="bg-glass-bg px-4 py-2 rounded-xl border border-border-main">
                    <p className="text-[10px] font-black uppercase tracking-widest text-text-muted">Built with</p>
                    <p className="text-xs font-bold">Gemini AI</p>
                  </div>
                  <div className="bg-glass-bg px-4 py-2 rounded-xl border border-border-main">
                    <p className="text-[10px] font-black uppercase tracking-widest text-text-muted">Status</p>
                    <p className="text-xs font-bold text-brand-primary">Pro Version</p>
                  </div>
                </div>
              </div>

              <button 
                onClick={() => setShowAboutModal(false)}
                className="btn-primary w-full py-5 text-xl"
              >
                Close
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
    </ErrorBoundary>
  );
}

// --- Sub-components ---

function MacroBar({ label, current, target, color, unit }: { label: string; current: number; target: number; color: string; unit: string }) {
  const progress = Math.min((current / target) * 100, 100);
  return (
    <div className="space-y-1.5">
      <div className="flex justify-between items-center px-1">
        <span className="text-[10px] font-bold text-text-muted uppercase tracking-widest">{label}</span>
        <span className="text-[10px] font-bold text-text-main/60">{current}/{target}{unit}</span>
      </div>
      <div className="h-1.5 bg-glass-bg rounded-full overflow-hidden">
        <motion.div 
          initial={{ width: 0 }}
          animate={{ width: `${progress}%` }}
          className="h-full rounded-full"
          style={{ backgroundColor: color }}
        />
      </div>
    </div>
  );
}

function PlanItem({ label, meal, onClick }: { label: string, meal: MealAnalysis, onClick: () => void }) {
  return (
    <button 
      onClick={onClick}
      className="bg-glass-bg p-4 rounded-3xl border border-border-main text-left hover:bg-white/5 transition-colors w-full group"
    >
      <div className="flex items-center justify-between mb-1">
        <p className="text-[8px] font-black uppercase tracking-widest text-text-muted">{label}</p>
        <ChevronRight className="w-3 h-3 text-text-muted group-hover:text-brand-primary transition-colors" />
      </div>
      <p className="text-xs font-bold truncate mb-1">{meal.mealName}</p>
      <div className="flex items-center gap-2">
        <p className="text-[10px] font-black text-brand-primary">{meal.calories} kcal</p>
        <span className="text-[8px] text-text-muted">•</span>
        <p className="text-[10px] font-black text-brand-accent">{meal.protein}g protein</p>
      </div>
    </button>
  );
}

function StatsCard({ icon: Icon, label, value, unit, color }: { icon: any; label: string; value: string; unit: string; color: string }) {
  return (
    <div className="glass-card p-3 md:p-4 rounded-[1.5rem] md:rounded-3xl space-y-2">
      <div className={cn("w-7 h-7 md:w-8 md:h-8 rounded-xl bg-glass-bg flex items-center justify-center", color)}>
        <Icon className="w-3.5 h-3.5 md:w-4 md:h-4" />
      </div>
      <div>
        <p className="text-lg md:text-xl font-black">{value}</p>
        <p className="text-[8px] md:text-[10px] text-text-muted font-bold uppercase tracking-widest">{label} · {unit}</p>
      </div>
    </div>
  );
}

function ProfileMenuItem({ icon: Icon, label, sub, onClick }: { icon: any; label: string; sub: string; onClick?: () => void }) {
  return (
    <button 
      onClick={onClick}
      className="w-full glass-card p-3 md:p-4 rounded-[1.5rem] md:rounded-3xl flex items-center justify-between hover:opacity-80 transition-all group"
    >
      <div className="flex items-center gap-3 md:gap-4">
        <div className="w-9 h-9 md:w-10 md:h-10 bg-glass-bg rounded-xl flex items-center justify-center text-text-muted group-hover:text-brand-primary transition-colors">
          <Icon className="w-4.5 h-4.5 md:w-5 md:h-5" />
        </div>
        <div className="text-left">
          <p className="font-bold text-sm">{label}</p>
          <p className="text-[10px] text-text-muted font-medium">{sub}</p>
        </div>
      </div>
      <ChevronRight className="w-4 h-4 text-text-muted/50" />
    </button>
  );
}
