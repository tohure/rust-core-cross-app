import { SafeAreaProvider } from 'react-native-safe-area-context';
import { BancoApp } from './ui/navigation/BancoApp';

export default function App() {
  return (
    <SafeAreaProvider>
      <BancoApp />
    </SafeAreaProvider>
  );
}
