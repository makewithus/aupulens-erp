'use client';

import { useEffect, useState, useCallback } from 'react';
import { useSession, signOut } from 'next-auth/react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

const INACTIVITY_TIMEOUT = 9 * 60 * 1000; // 9 minutes (warning appears)
const COUNTDOWN_TIME = 60; // 60 seconds (total 10 mins)

export function SessionTimeout() {
  const { data: session, status } = useSession();
  const [showWarning, setShowWarning] = useState(false);
  const [countdown, setCountdown] = useState(COUNTDOWN_TIME);
  const [lastActivity, setLastActivity] = useState(Date.now());

  const resetTimer = useCallback(() => {
    setLastActivity(Date.now());
    if (showWarning) {
      setShowWarning(false);
      setCountdown(COUNTDOWN_TIME);
    }
  }, [showWarning]);

  useEffect(() => {
    if (status !== 'authenticated') return;

    const events = ['mousedown', 'mousemove', 'keypress', 'scroll', 'touchstart'];
    
    // Throttle the reset to avoid running it on every single pixel of mouse movement
    let throttleTimeout: NodeJS.Timeout | null = null;
    const handleActivity = () => {
      if (!throttleTimeout) {
        throttleTimeout = setTimeout(() => {
          resetTimer();
          throttleTimeout = null;
        }, 1000);
      }
    };

    events.forEach(event => document.addEventListener(event, handleActivity));

    return () => {
      events.forEach(event => document.removeEventListener(event, handleActivity));
      if (throttleTimeout) clearTimeout(throttleTimeout);
    };
  }, [status, resetTimer]);

  useEffect(() => {
    if (status !== 'authenticated') return;

    const checkInactivity = setInterval(() => {
      if (Date.now() - lastActivity >= INACTIVITY_TIMEOUT && !showWarning) {
        setShowWarning(true);
      }
    }, 10000); // Check every 10 seconds

    return () => clearInterval(checkInactivity);
  }, [status, lastActivity, showWarning]);

  useEffect(() => {
    let countdownInterval: NodeJS.Timeout;
    if (showWarning && countdown > 0) {
      countdownInterval = setInterval(() => {
        setCountdown((prev) => prev - 1);
      }, 1000);
    } else if (showWarning && countdown === 0) {
      signOut({ callbackUrl: '/auth' });
    }

    return () => {
      if (countdownInterval) clearInterval(countdownInterval);
    };
  }, [showWarning, countdown]);

  if (!showWarning) return null;

  return (
    <AlertDialog open={showWarning}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Session Expiring Soon</AlertDialogTitle>
          <AlertDialogDescription>
            You have been inactive for a while. For your security, you will be logged out in{' '}
            <span className="font-bold text-red-500">{countdown}</span> seconds.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogAction onClick={resetTimer}>Continue Working</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
