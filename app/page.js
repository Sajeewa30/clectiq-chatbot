import Chatbot from '../components/Chatbot';

export default function Home() {
  const config = {
    typingSpeedMs: 15,
    webhook: {
      route: 'general',
    },
    branding: {
      logo: '/logo.svg',
      name: 'Clectiq',
      welcomeText: "Hi there! I'm the Clectiq assistant.",
      responseTimeText: '',
    },
    style: {
      primaryColor: '#0f172a',
      secondaryColor: '#0f172a',
      position: 'right',
      backgroundColor: '#0b1220',
      fontColor: '#e5e7eb',
    },
  };

  return (
    <main>
      <Chatbot config={config} />
    </main>
  );
}
