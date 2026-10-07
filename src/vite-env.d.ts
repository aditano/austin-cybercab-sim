/// <reference types="vite/client" />
export {};
declare global {
  interface Window {
    render_game_to_text: () => string;
    advanceTime: (ms: number) => void;
    /** Test hook. Skips sim updates and rendering while the frame loop stays scheduled. */
    __cybercabPause?: boolean;
  }
}
