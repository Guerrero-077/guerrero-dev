/**
 * Perfil de hardware de la máquina donde corre Guerrero Dev (Fase 2 §11).
 * Permite decisiones "hardware-aware", como enrutar a un modelo local vs
 * cloud según VRAM/RAM disponible.
 */
export interface HardwareProfile {
  cpu: {
    cores: number;
    model?: string;
  };
  ramTotalMb: number;
  ramAvailableMb: number;
  gpu?: {
    model: string;
    vramTotalMb: number;
    vramAvailableMb: number;
  };
}
