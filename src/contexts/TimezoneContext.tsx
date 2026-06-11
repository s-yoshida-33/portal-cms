import { createContext, useContext, useState } from 'react';

export type Timezone = 'utc' | 'local'; // local = Asia/Tokyo (GMT+9)

const TIMEZONE_KEY = 'portal-timezone';

interface TimezoneContextValue {
  timezone:    Timezone;
  setTimezone: (tz: Timezone) => void;
}

const TimezoneContext = createContext<TimezoneContextValue>({
  timezone:    'local',
  setTimezone: () => {},
});

export function TimezoneProvider({ children }: { children: React.ReactNode }) {
  const [timezone, setTimezoneState] = useState<Timezone>(
    () => (localStorage.getItem(TIMEZONE_KEY) as Timezone | null) ?? 'local'
  );

  function setTimezone(tz: Timezone) {
    setTimezoneState(tz);
    localStorage.setItem(TIMEZONE_KEY, tz);
  }

  return (
    <TimezoneContext.Provider value={{ timezone, setTimezone }}>
      {children}
    </TimezoneContext.Provider>
  );
}

export function useTimezone() {
  return useContext(TimezoneContext);
}
