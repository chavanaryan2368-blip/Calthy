import React, { useState, useEffect, useRef } from 'react';
import { GoogleMap, Polyline, Marker, useJsApiLoader } from '@react-google-maps/api';
import { Play, Pause, Square, Clock, Activity, Zap, Footprints, AlertCircle } from 'lucide-react';
import { collection, addDoc } from 'firebase/firestore';
import { db } from '../firebase';

const containerStyle = {
  width: '100%',
  height: '100%'
};

// Define the global auth failure handler for Google Maps at the top level
// to ensure it's available as soon as the script loads.
if (typeof window !== 'undefined') {
  (window as any).gm_authFailure = () => {
    console.error("Google Maps authentication failed: Invalid API Key or restrictions.");
    // We'll use a custom event to notify components
    window.dispatchEvent(new CustomEvent('google-maps-auth-failure'));
  };
}

function PathVisualizer({ path, currentPosition }: { path: { lat: number; lng: number }[], currentPosition: { lat: number; lng: number } | null }) {
  if (path.length === 0 && !currentPosition) {
    return (
      <div className="w-full h-full flex flex-col items-center justify-center bg-glass-bg p-8 text-center">
        <Footprints className="w-12 h-12 text-text-muted/20 mb-4" />
        <p className="text-text-muted text-sm font-bold">Waiting for GPS signal...</p>
      </div>
    );
  }

  const allPoints = [...path];
  if (currentPosition) allPoints.push(currentPosition);

  const lats = allPoints.map(p => p.lat);
  const lngs = allPoints.map(p => p.lng);
  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);
  const minLng = Math.min(...lngs);
  const maxLng = Math.max(...lngs);

  const padding = 0.0005;
  const rangeLat = Math.max(maxLat - minLat, padding);
  const rangeLng = Math.max(maxLng - minLng, padding);

  const getX = (lng: number) => ((lng - minLng) / rangeLng) * 100;
  const getY = (lat: number) => 100 - ((lat - minLat) / rangeLat) * 100;

  const points = allPoints.map(p => `${getX(p.lng)},${getY(p.lat)}`).join(' ');

  return (
    <div className="w-full h-full bg-glass-bg p-6 flex flex-col items-center justify-center relative">
      <div className="absolute top-4 left-4 bg-black/20 backdrop-blur-md px-3 py-1 rounded-full border border-white/10">
        <p className="text-[8px] text-white/60 font-black uppercase tracking-widest">Path Preview (Map Unavailable)</p>
      </div>
      <svg viewBox="-10 -10 120 120" className="w-full h-full max-h-[250px] drop-shadow-[0_0_15px_rgba(204,255,0,0.2)]">
        <polyline
          points={points}
          fill="none"
          stroke="#CCFF00"
          strokeWidth="4"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        {path.length > 0 && (
          <circle cx={getX(path[0].lng)} cy={getY(path[0].lat)} r="5" fill="#CCFF00" />
        )}
        {currentPosition && (
          <circle cx={getX(currentPosition.lng)} cy={getY(currentPosition.lat)} r="6" fill="white" stroke="#CCFF00" strokeWidth="3" />
        )}
      </svg>
    </div>
  );
}

// Haversine formula to calculate distance between two points in km
const calculateDistance = (lat1: number, lon1: number, lat2: number, lon2: number) => {
  const R = 6371; // Radius of the earth in km
  const dLat = (lat2 - lat1) * (Math.PI / 180);
  const dLon = (lon2 - lon1) * (Math.PI / 180);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * (Math.PI / 180)) * Math.cos(lat2 * (Math.PI / 180)) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  const d = R * c; // Distance in km
  return d;
};

export default function RunTracker({ userWeight, uid, onActivitySaved }: { userWeight: number; uid: string; onActivitySaved?: () => void }) {
  const [isTracking, setIsTracking] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [path, setPath] = useState<{ lat: number; lng: number }[]>([]);
  const [currentPosition, setCurrentPosition] = useState<{ lat: number; lng: number } | null>(null);
  const [distance, setDistance] = useState(0);
  const [elapsedTime, setElapsedTime] = useState(0);
  const [speed, setSpeed] = useState(0);
  
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const watchIdRef = useRef<number | null>(null);

  const { isLoaded, loadError } = useJsApiLoader({
    id: 'google-map-script',
    googleMapsApiKey: import.meta.env.VITE_GOOGLE_MAPS_API_KEY || (window as any).GOOGLE_MAPS_API_KEY || (typeof process !== 'undefined' ? process.env.VITE_GOOGLE_MAPS_API_KEY : "") || ""
  });

  const [authError, setAuthError] = useState<string | null>(null);

  useEffect(() => {
    const handleAuthFailure = () => {
      setAuthError("Invalid API Key: The Google Maps API key provided is invalid, restricted, or has expired.");
    };

    window.addEventListener('google-maps-auth-failure', handleAuthFailure);
    return () => {
      window.removeEventListener('google-maps-auth-failure', handleAuthFailure);
    };
  }, []);

  useEffect(() => {
    if (isTracking && !isPaused) {
      timerRef.current = setInterval(() => {
        setElapsedTime(prev => prev + 1);
      }, 1000);

      if (navigator.geolocation) {
        watchIdRef.current = navigator.geolocation.watchPosition(
          (position) => {
            const newPos = {
              lat: position.coords.latitude,
              lng: position.coords.longitude
            };
            
            setCurrentPosition(newPos);
            
            setPath(prev => {
              if (prev.length > 0) {
                const lastPos = prev[prev.length - 1];
                const d = calculateDistance(lastPos.lat, lastPos.lng, newPos.lat, newPos.lng);
                if (d > 0.005) { // Only add if moved more than 5 meters
                   setDistance(prevD => prevD + d);
                   return [...prev, newPos];
                }
                return prev;
              }
              return [newPos];
            });
            
            if (position.coords.speed) {
                setSpeed(position.coords.speed * 3.6); // Convert m/s to km/h
            }
          },
          (error) => console.error(error),
          { enableHighAccuracy: true }
        );
      }
    } else {
      if (timerRef.current) clearInterval(timerRef.current);
      if (watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current);
        watchIdRef.current = null;
      }
    }

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (watchIdRef.current !== null) navigator.geolocation.clearWatch(watchIdRef.current);
    };
  }, [isTracking, isPaused]);

  const handleStart = () => {
    setIsTracking(true);
    setIsPaused(false);
  };

  const handlePause = () => {
    setIsPaused(true);
  };

  const handleStop = async () => {
    const caloriesBurned = distance * userWeight * 1.036;
    const activity = {
        type: 'run',
        distance,
        time: elapsedTime,
        caloriesBurned,
        timestamp: Date.now(),
        uid
    };
    
    try {
      await addDoc(collection(db, 'users', uid, 'activities'), activity);
    } catch (error) {
      console.error("Error saving activity:", error);
    }
    
    if (onActivitySaved) onActivitySaved();
    
    setIsTracking(false);
    setIsPaused(false);
    setPath([]);
    setDistance(0);
    setElapsedTime(0);
    setSpeed(0);
  };

  const formatTime = (seconds: number) => {
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    return `${hrs > 0 ? hrs + ':' : ''}${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const avgPace = distance > 0 ? (elapsedTime / 60) / distance : 0;
  const calories = distance * userWeight * 1.036;

  return (
    <div className="flex flex-col h-full space-y-4 overflow-y-auto no-scrollbar pb-20">
      <div className="flex-shrink-0 w-full aspect-square sm:aspect-video rounded-[1.5rem] md:rounded-[2.5rem] overflow-hidden glass-card relative min-h-[300px]">
        {!(import.meta.env.VITE_GOOGLE_MAPS_API_KEY || (window as any).GOOGLE_MAPS_API_KEY || (typeof process !== 'undefined' ? process.env.VITE_GOOGLE_MAPS_API_KEY : "")) ? (
          <div className="w-full h-full flex flex-col items-center justify-center bg-glass-bg p-8 text-center">
            <p className="text-brand-primary font-bold mb-2">Setup Required</p>
            <p className="text-xs text-text-muted">
              Please add your Google Maps API Key to the project settings as <code className="bg-white/10 px-1 rounded">VITE_GOOGLE_MAPS_API_KEY</code>.
            </p>
          </div>
        ) : (loadError || authError) ? (
          <div className="w-full h-full relative">
            <PathVisualizer path={path} currentPosition={currentPosition} />
            <div className="absolute bottom-4 left-4 right-4 bg-red-500/20 backdrop-blur-xl border border-red-500/30 p-3 rounded-2xl flex items-center gap-3">
              <AlertCircle className="w-5 h-5 text-red-400 flex-shrink-0" />
              <p className="text-[10px] text-red-200 font-medium leading-tight">
                {authError || (loadError?.message.includes('ApiProjectMapError') 
                  ? "Google Maps API is not enabled for this project. Please check your Google Cloud Console."
                  : "Failed to load Google Maps. Using path visualizer instead.")}
              </p>
            </div>
          </div>
        ) : isLoaded ? (
          <GoogleMap
            mapContainerStyle={containerStyle}
            center={currentPosition || { lat: 20.5937, lng: 78.9629 }}
            zoom={15}
            options={{
                disableDefaultUI: true,
            }}
          >
            {path.length > 0 && <Marker position={path[0]} label="S" />}
            {path.length > 1 && !isTracking && <Marker position={path[path.length - 1]} label="F" />}
            {currentPosition && isTracking && <Marker position={currentPosition} />}
            <Polyline
              path={path}
              options={{
                strokeColor: '#CCFF00',
                strokeOpacity: 1,
                strokeWeight: 4,
              }}
            />
          </GoogleMap>
        ) : (
          <div className="w-full h-full flex items-center justify-center bg-glass-bg">
            <p className="text-text-muted">Loading Map...</p>
          </div>
        )}
        
        {!isTracking && (
            <div className="absolute inset-0 bg-bg-main/40 backdrop-blur-sm flex items-center justify-center p-8 text-center">
                <div className="space-y-4">
                    <div className="w-20 h-20 bg-brand-primary rounded-3xl mx-auto flex items-center justify-center rotate-12">
                        <Footprints className="w-10 h-10 text-black" />
                    </div>
                    <h3 className="text-xl md:text-2xl font-black">Ready for a run?</h3>
                    <p className="text-sm text-text-muted">Track your distance, pace, and calories in real-time.</p>
                </div>
            </div>
        )}
      </div>

      <div className="glass-card p-5 md:p-6 rounded-[1.5rem] md:rounded-[2.5rem] space-y-6">
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1">
            <p className="text-[10px] font-black uppercase tracking-widest text-text-muted">Distance</p>
            <p className="text-2xl md:text-3xl font-black">{distance.toFixed(2)} <span className="text-sm font-bold text-text-muted">km</span></p>
          </div>
          <div className="space-y-1">
            <p className="text-[10px] font-black uppercase tracking-widest text-text-muted">Time</p>
            <p className="text-2xl md:text-3xl font-black">{formatTime(elapsedTime)}</p>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-2">
          <div className="bg-glass-bg p-3 rounded-2xl text-center border border-border-main">
            <Zap className="w-4 h-4 mx-auto mb-1 text-brand-primary" />
            <p className="text-sm font-black">{speed.toFixed(1)}</p>
            <p className="text-[8px] text-text-muted uppercase font-black">km/h</p>
          </div>
          <div className="bg-glass-bg p-3 rounded-2xl text-center border border-border-main">
            <Clock className="w-4 h-4 mx-auto mb-1 text-brand-accent" />
            <p className="text-sm font-black">{avgPace.toFixed(2)}</p>
            <p className="text-[8px] text-text-muted uppercase font-black">min/km</p>
          </div>
          <div className="bg-glass-bg p-3 rounded-2xl text-center border border-border-main">
            <Activity className="w-4 h-4 mx-auto mb-1 text-orange-400" />
            <p className="text-sm font-black">{calories.toFixed(0)}</p>
            <p className="text-[8px] text-text-muted uppercase font-black">kcal</p>
          </div>
        </div>

        <div className="flex gap-4">
          {!isTracking ? (
            <button 
              onClick={handleStart}
              className="flex-1 btn-primary py-5 text-lg"
            >
              <Play className="w-6 h-6 fill-current" />
              Start Workout
            </button>
          ) : (
            <>
              <button 
                onClick={isPaused ? handleStart : handlePause}
                className="flex-1 btn-secondary py-5 text-lg"
              >
                {isPaused ? <Play className="w-6 h-6 fill-current" /> : <Pause className="w-6 h-6 fill-current" />}
                {isPaused ? 'Resume' : 'Pause'}
              </button>
              <button 
                onClick={handleStop}
                className="flex-1 bg-red-500 text-white rounded-full font-bold flex items-center justify-center gap-2 hover:scale-105 transition-all active:scale-95"
              >
                <Square className="w-6 h-6 fill-current" />
                Stop
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
