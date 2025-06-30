import { useState, useCallback } from 'react';

interface LoadingStates {
  initial: boolean;
  refreshing: boolean;
  polling: boolean;
  deviceSwitching: boolean;
}

export function useLoadingStates() {
  const [loadingStates, setLoadingStates] = useState<LoadingStates>({
    initial: true,
    refreshing: false,
    polling: false,
    deviceSwitching: false
  });

  const updateLoadingState = useCallback((key: keyof LoadingStates, value: boolean) => {
    setLoadingStates(prev => ({
      ...prev,
      [key]: value
    }));
  }, []);

  const setInitialLoading = useCallback((loading: boolean) => {
    updateLoadingState('initial', loading);
  }, [updateLoadingState]);

  const setRefreshingLoading = useCallback((loading: boolean) => {
    updateLoadingState('refreshing', loading);
  }, [updateLoadingState]);

  const setPollingLoading = useCallback((loading: boolean) => {
    updateLoadingState('polling', loading);
  }, [updateLoadingState]);

  const setDeviceSwitchingLoading = useCallback((loading: boolean) => {
    updateLoadingState('deviceSwitching', loading);
  }, [updateLoadingState]);

  const isAnyLoading = () => {
    return Object.values(loadingStates).some(state => state);
  };

  const shouldShowSkeleton = () => {
    return loadingStates.initial || loadingStates.deviceSwitching;
  };

  const shouldShowRefreshSpinner = () => {
    return loadingStates.refreshing && !loadingStates.initial && !loadingStates.deviceSwitching;
  };

  return {
    loadingStates,
    setInitialLoading,
    setRefreshingLoading,
    setPollingLoading,
    setDeviceSwitchingLoading,
    isAnyLoading,
    shouldShowSkeleton,
    shouldShowRefreshSpinner
  };
}
