import { useState } from 'react';
import { readCrewTextSize, saveCrewTextSize, type CrewTextSize } from '@/lib/textSizePreference';

export default function TextSizeSetting() {
  const [value, setValue] = useState(readCrewTextSize);
  const [failed, setFailed] = useState(false);
  return <section className="cz-toolbox cc-text-size-setting" aria-labelledby="cc-text-size-title">
    <h3 id="cc-text-size-title">Tamanho do texto</h3>
    <p id="cc-text-size-help">Escolha a leitura normal ou ampliada. A preferência fica nesta conta, neste navegador.</p>
    <label htmlFor="cc-text-size">Texto
      <select id="cc-text-size" value={value} aria-describedby="cc-text-size-help" onChange={event => {
        const next = Number(event.target.value) as CrewTextSize;
        const saved = saveCrewTextSize(next);
        setFailed(!saved);
        if (saved) setValue(next);
      }}>
        <option value={100}>100%</option>
        <option value={150}>150%</option>
        <option value={200}>200%</option>
      </select>
    </label>
    {failed && <p role="status">Não foi possível salvar a preferência neste navegador.</p>}
  </section>;
}
