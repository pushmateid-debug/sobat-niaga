import React from 'react';
const AuthForm = ({ onLogin }) => {

  const handleLogin = () => {
    if (onLogin) {
      onLogin({

        uid: 'user_demo_123',

        displayName: 'Sobat Niaga',

        email: 'demo@sobatniaga.com',

        photoURL: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Felix',

        saldo: 500000

      });

    }

  };



  return (

    <div onClick={handleLogin} className="min-h-screen w-full relative overflow-hidden cursor-pointer">

    </div>

  );

};



export default AuthForm;