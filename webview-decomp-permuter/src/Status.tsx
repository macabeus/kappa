import { VscodeIcon } from '@vscode-elements/react-elements';
import { useEffect, useState } from 'react';

import { useVSCodeAPI } from './hooks';

export function Status() {
  const api = useVSCodeAPI();
  const [status, setStatus] = useState('loading');

  useEffect(() => {
    const cleanupStatus = api.onMessage('update-status', (payload) => {
      setStatus(payload?.status ?? 'unknown');
    });

    return () => {
      cleanupStatus();
    };
  });

  if (status === 'loading') {
    <div>
      <VscodeIcon name="loading" spin spin-duration="1" /> Loading...
    </div>;
  }

  return (
    <div>
      <VscodeIcon name="pass-filled" spin spin-duration="1" /> Success
    </div>
  );
}
