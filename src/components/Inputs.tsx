import { BITOLAS_MM } from "../calc/puncao";
import { fmt, fmtRho } from "../calc/format";
import type { PunchingInput, PunchingResult } from "../calc/types";

interface InputsProps {
  input: PunchingInput;
  result: PunchingResult;
  set: <K extends keyof PunchingInput>(key: K, value: PunchingInput[K]) => void;
}

export function Inputs({ input, result, set }: InputsProps) {
  return (
    <aside className="inputs no-print">
      <h2 className="panel-title">Entrada</h2>

      <section>
        <h3>Dimensões do pilar</h3>
        <Num label="c₁ paralelo a x" value={input.cx} unit="cm" onChange={(v) => set("cx", v)} />
        <Num label="c₂ paralelo a z" value={input.cz} unit="cm" onChange={(v) => set("cz", v)} />
        <p className="hint">Pilar retangular. C₁ e C₂ da Tabela 19.2 seguem a direção da excentricidade de cada momento.</p>
      </section>

      <section>
        <h3>Posição</h3>
        <Select
          label="Posição do pilar"
          value={input.position}
          onChange={(v) => set("position", v as PunchingInput["position"])}
          options={[
            ["interno", "Interno"],
            ["borda", "Borda"],
            ["canto", "Canto"],
          ]}
        />
        {input.position === "borda" && (
          <>
            <Select
              label="Borda livre paralela a"
              value={input.edgeAxis}
              onChange={(v) => set("edgeAxis", v as PunchingInput["edgeAxis"])}
              options={[
                ["x", "eixo x"],
                ["z", "eixo z"],
              ]}
            />
            {input.edgeAxis === "x" ? (
              <Num label="Face do pilar à borda" value={input.distZ} unit="cm" onChange={(v) => set("distZ", v)} />
            ) : (
              <Num label="Face do pilar à borda" value={input.distX} unit="cm" onChange={(v) => set("distX", v)} />
            )}
          </>
        )}
        {input.position === "canto" && (
          <>
            <Num label="Face à borda paralela a x" value={input.distZ} unit="cm" onChange={(v) => set("distZ", v)} />
            <Num label="Face à borda paralela a z" value={input.distX} unit="cm" onChange={(v) => set("distX", v)} />
          </>
        )}
      </section>

      <section>
        <h3>Espessura da laje</h3>
        <Num label="h" value={input.h} unit="cm" onChange={(v) => set("h", v)} />
      </section>

      <section>
        <h3>Propriedades do concreto</h3>
        <Num label="fck" value={input.fck} unit="MPa" onChange={(v) => set("fck", v)} />
        <Num label="γc" value={input.gammaC} unit="" onChange={(v) => set("gammaC", v)} />
      </section>

      <section>
        <h3>Armadura de flexão</h3>
        <Num label="Cobrimento" value={input.cobrimento} unit="cm" onChange={(v) => set("cobrimento", v)} />
        <Num label="fyk" value={input.fyk} unit="MPa" onChange={(v) => set("fyk", v)} />
        <Select
          label="Bitola"
          value={String(input.bitola)}
          onChange={(v) => set("bitola", Number(v))}
          options={BITOLAS_MM.map((b) => [String(b), `${String(b).replace(".", ",")} mm`])}
        />
        <Num label="As,x" value={input.asx} unit="cm²/m" onChange={(v) => set("asx", v)} />
        <Num label="As,z" value={input.asz} unit="cm²/m" onChange={(v) => set("asz", v)} />
        {result.ok && (
          <p className="readout">
            d = {fmt(result.d, 2)} cm · ρ = {fmtRho(result.rho)}
          </p>
        )}
      </section>

      <section>
        <h3>Armadura de punção</h3>
        <Toggle
          label="Considerar armadura de punção"
          on={input.punchingOn}
          onChange={(v) => set("punchingOn", v)}
        />
        {(input.punchingOn || result.reinforcementRequired) && (
          <>
            <Select
              label="Tipo"
              value={input.punchingType}
              onChange={(v) => set("punchingType", v as PunchingInput["punchingType"])}
              options={[
                ["estribos", "Estribos verticais"],
                ["studs", "Studs"],
              ]}
            />
            {!input.punchingOn && (
              <Num label="φ da armadura" value={input.bitolaW} unit="mm" onChange={(v) => set("bitolaW", v)} />
            )}
            {result.bars && (
              <p className="readout">
                {result.bars.suggested ? "Sugestão: " : "Desenho: "}
                {result.bars.lines * result.bars.perLine} {result.bars.type === "studs" ? "studs" : "estribos"}
                {" · "}
                {result.bars.perLine} por linha × {result.bars.lines}
                {" · reta "}
                {result.bars.reta}
                {" · diagonal "}
                {result.bars.diagonal}
              </p>
            )}
          </>
        )}
        {input.punchingOn && (
          <>
            <Num label="Asw por contorno" value={input.asw} unit="cm²" onChange={(v) => set("asw", v)} />
            <Num label="sr" value={input.sr} unit="cm" onChange={(v) => set("sr", v)} />
            <Num label="Ângulo α" value={input.angulo} unit="°" onChange={(v) => set("angulo", v)} />
            <Num label="Linhas" value={input.nLinhas} unit="" step={1} onChange={(v) => set("nLinhas", Math.round(v))} />
            <Num label="s0 da face" value={input.s0} unit="cm" onChange={(v) => set("s0", v)} />
            <Num label="φ da armadura" value={input.bitolaW} unit="mm" onChange={(v) => set("bitolaW", v)} />
            {result.ok && (
              <p className="hint">
                Limites: sr ≤ 0,75d = {fmt(result.srMax, 2)} cm; s0 ≤ 0,5d = {fmt(result.s0Max, 2)} cm.
              </p>
            )}
          </>
        )}
      </section>

      <section>
        <h3>Cargas de cálculo</h3>
        <Select
          label="Modo"
          value={input.loadMode}
          onChange={(v) => set("loadMode", v as PunchingInput["loadMode"])}
          options={[
            ["calculo", "Valores já de cálculo"],
            ["caracteristico", "Valores característicos"],
          ]}
        />
        {input.loadMode === "caracteristico" && (
          <Num label="γf" value={input.gammaF} unit="" onChange={(v) => set("gammaF", v)} />
        )}
        {input.loadMode === "calculo" ? (
          <>
            <Num label="FSd" value={input.fSd} unit="kN" onChange={(v) => set("fSd", v)} />
            <Num label="MSd,x" value={input.mSdx} unit="kN·m" onChange={(v) => set("mSdx", v)} />
            <Num label="MSd,z" value={input.mSdz} unit="kN·m" onChange={(v) => set("mSdz", v)} />
          </>
        ) : (
          <>
            <Num label="Fk" value={input.fK} unit="kN" onChange={(v) => set("fK", v)} />
            <Num label="Mk,x" value={input.mKx} unit="kN·m" onChange={(v) => set("mKx", v)} />
            <Num label="Mk,z" value={input.mKz} unit="kN·m" onChange={(v) => set("mKz", v)} />
          </>
        )}
        <Toggle
          label="Considerar ambos os sinais dos momentos"
          on={input.bothSigns}
          onChange={(v) => set("bothSigns", v)}
        />
      </section>

      <section>
        <h3>Carga uniforme</h3>
        <Toggle
          label="Descontar carga dentro do perímetro"
          on={input.uniformOn}
          onChange={(v) => set("uniformOn", v)}
        />
        {input.uniformOn && (
          <Num
            label={input.loadMode === "calculo" ? "qSd" : "qk"}
            value={input.q}
            unit="kN/m²"
            onChange={(v) => set("q", v)}
          />
        )}
      </section>

      <section>
        <h3>Relatório</h3>
        <Select
          label="Detalhe"
          value={input.reportLevel}
          onChange={(v) => set("reportLevel", v as PunchingInput["reportLevel"])}
          options={[
            ["resumido", "Resumido"],
            ["completo", "Completo"],
          ]}
        />
      </section>

      <p className="edition">NBR 6118:2014, seção 19.5, com limites de ρ e k da edição 2023.</p>
    </aside>
  );
}

function Num({
  label,
  value,
  unit,
  onChange,
  step = "any",
}: {
  label: string;
  value: number;
  unit: string;
  onChange: (value: number) => void;
  step?: number | "any";
}) {
  return (
    <label className="field">
      <span>{label}</span>
      <span className="field-control">
        <input
          type="number"
          value={Number.isFinite(value) ? value : ""}
          step={step}
          onChange={(e) => {
            const next = e.target.valueAsNumber;
            if (Number.isFinite(next)) onChange(next);
          }}
        />
        <span className="unit">{unit}</span>
      </span>
    </label>
  );
}

function Select({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: Array<[string, string]>;
  onChange: (value: string) => void;
}) {
  return (
    <label className="field">
      <span>{label}</span>
      <span className="field-control">
        <select value={value} onChange={(e) => onChange(e.target.value)}>
          {options.map(([v, text]) => (
            <option key={v} value={v}>
              {text}
            </option>
          ))}
        </select>
        <span className="unit" />
      </span>
    </label>
  );
}

function Toggle({ label, on, onChange }: { label: string; on: boolean; onChange: (value: boolean) => void }) {
  return (
    <label className="toggle">
      <span>{label}</span>
      <button type="button" role="switch" aria-checked={on} className={on ? "switch on" : "switch"} onClick={() => onChange(!on)}>
        <span />
      </button>
    </label>
  );
}
