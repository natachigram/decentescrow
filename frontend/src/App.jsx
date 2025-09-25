import React from 'react';
import EscrowDashboard from './components/EscrowDashboard';
import { AOProvider } from './context/AOContext';
import './App.css';

function App() {
  return (
    <AOProvider>
      <div className='App'>
        <EscrowDashboard />
      </div>
    </AOProvider>
  );
}

export default App;
