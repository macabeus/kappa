import { VscodeProgressRing } from '@vscode-elements/react-elements';
import React, { useEffect, useState } from 'react';

import './App.css';
import { Status } from './Status';
import { useVSCodeAPI } from './hooks';

interface PermuterStatus {
  isRunning: boolean;
  output: string[];
  bestMatch: string | null;
  error?: string;
}

const App: React.FC = () => {
  const api = useVSCodeAPI();
  const [status, setStatus] = useState<PermuterStatus>({
    isRunning: false,
    output: [],
    bestMatch: null,
  });

  useEffect(() => {
    // Send ready message when component mounts
    api.sendMessage({ type: 'ready' });

    // Set up message handlers
    const cleanupInit = api.onMessage('init', () => {
      console.log('Webview initialized');
    });

    const cleanupStatus = api.onMessage('update-status', (payload) => {
      setStatus((prevStatus) => ({
        ...prevStatus,
        isRunning: payload?.isRunning ?? false,
      }));
    });

    const cleanupOutput = api.onMessage('permuter-output', (payload) => {
      setStatus((prevStatus) => ({
        ...prevStatus,
        output: [...prevStatus.output, payload?.output ?? ''],
      }));
    });

    const bestMatch = api.onMessage('best-match', (payload) => {
      setStatus((prevStatus) => ({
        ...prevStatus,
        bestMatch: payload?.bestMatch,
      }));
    });

    const cleanupError = api.onMessage('error', (payload) => {
      setStatus((prevStatus) => ({
        ...prevStatus,
        error: payload?.error ?? 'Unknown error',
        isRunning: false,
      }));
    });

    // Cleanup function
    return () => {
      cleanupInit();
      cleanupStatus();
      cleanupOutput();
      bestMatch();
      cleanupError();
    };
  }, [api]);

  // const handleCancelPermuter = () => {
  //   api.cancelPermuter();
  //   setStatus((prevStatus) => ({
  //     ...prevStatus,
  //     isRunning: false,
  //   }));
  // };

  return (
    <div className="app">
      <Status />

      {status.error && (
        <div className="error">
          <h3>Error:</h3>
          <p>{status.error}</p>
        </div>
      )}

      <div className="output">
        <h3>Logs:</h3>
        <div className="output-content">
          {status.output.length === 0 ? (
            <p className="no-output">No output yet...</p>
          ) : (
            <div className="output-lines">
              {status.output.map((line, index) => (
                <div key={index} className="output-line">
                  {line}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="output">
        <h3>Best Match:</h3>
        <div className="output-content">
          {!status.bestMatch ? (
            <p className="no-output">No output yet...</p>
          ) : (
            <textarea readOnly>{status.bestMatch}</textarea>
          )}
        </div>
      </div>

      {status.isRunning && (
        <div className="status">
          <VscodeProgressRing></VscodeProgressRing>
          <span>Running decomp-permuter...</span>
        </div>
      )}
    </div>
  );
};

export default App;
