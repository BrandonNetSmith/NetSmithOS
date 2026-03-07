import { ModeRouter } from "./modes/ModeRouter";
import { ToastProvider } from "./components/Toast";

function App() {
  return (
    <ToastProvider>
      <ModeRouter />
    </ToastProvider>
  );
}

export default App;
