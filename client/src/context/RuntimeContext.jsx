import { createContext, useContext, useEffect, useState } from 'react';
import { api } from '../api/client';

const RuntimeContext = createContext({ dataProfile: '' });

export function RuntimeProvider({ children }) {
  const [runtime, setRuntime] = useState({ dataProfile: '' });
  useEffect(() => {
    api.getRuntime()
      .then((data) => setRuntime({ dataProfile: data.dataProfile || '' }))
      .catch(() => {});
  }, []);
  return <RuntimeContext.Provider value={runtime}>{children}</RuntimeContext.Provider>;
}

export function useRuntime() {
  return useContext(RuntimeContext);
}
