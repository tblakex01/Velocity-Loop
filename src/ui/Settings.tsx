import { useRef, useState } from "react";
import type { Quality } from "../runtime";
import type { LocalRecord } from "../game/types";
import { importRecords, MAX_RECORD_FILE_BYTES } from "../persistence";
import { Modal } from "./Modal";
import { OlderRecords } from "./OlderRecords";
export type SettingsValue = {
  sound: boolean;
  quality: Quality;
  autoThrottle: boolean;
  ghost: boolean;
};
export function Settings({
  value,
  onChange,
  records,
  onImport,
  onClose,
}: {
  value: SettingsValue;
  onChange: (value: SettingsValue) => void;
  records: LocalRecord[];
  onImport: () => void;
  onClose: () => void;
}) {
  const file = useRef<HTMLInputElement>(null),
    [status, setStatus] = useState("");
  const upload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const selected = event.target.files?.[0];
    if (!selected) return;
    try {
      if (selected.size > MAX_RECORD_FILE_BYTES)
        throw new Error("Choose a file smaller than 64 MB.");
      const count = await importRecords(await selected.text());
      setStatus(`Imported ${count} best records. Imported times remain local.`);
      onImport();
    } catch (e) {
      setStatus((e as Error).message);
    }
    event.target.value = "";
  };
  const download = () => {
    const contents = JSON.stringify({ version: 1, records });
    const blob = new Blob([contents], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "velocity-loop-records.json";
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  return (
    <Modal
      title="MAKE IT YOUR DRIVE"
      subtitle="SETTINGS & RECORDS"
      onClose={onClose}
    >
      <div className="settings-list">
        {(
          [
            [
              "sound",
              "Engine sound",
              "Original synthesized engine and race cues.",
            ],
            [
              "autoThrottle",
              "Auto accelerator",
              "Keep throttle held; you steer, brake and boost.",
            ],
            [
              "ghost",
              "Personal-best ghost",
              "Race your recorded inputs from this car and assist.",
            ],
          ] as const
        ).map(([key, label, description]) => (
          <label key={key} className="toggle-row">
            <span>
              <strong>{label}</strong>
              <small>{description}</small>
            </span>
            <input
              type="checkbox"
              checked={value[key]}
              onChange={(e) => onChange({ ...value, [key]: e.target.checked })}
            />
          </label>
        ))}
        <label className="toggle-row">
          <span>
            <strong>Graphics quality</strong>
            <small>Auto adapts resolution to frame rate.</small>
          </span>
          <select
            value={value.quality}
            onChange={(e) =>
              onChange({ ...value, quality: e.target.value as Quality })
            }
          >
            <option value="auto">Auto</option>
            <option value="high">High</option>
            <option value="low">Low</option>
          </select>
        </label>
      </div>
      <div className="controls-reference">
        <h3>CONTROLS</h3>
        <p>
          <b>Keyboard</b> WASD / arrows drive · Space / Shift boost · C camera ·
          P / Esc pause · R retry
        </p>
        <p>
          <b>Gamepad</b> Left stick steer · RT accelerate · LT brake · A boost ·
          Y camera · Start pause · X retry
        </p>
        <p>
          <b>Touch</b> Hold steering, accelerator and nitro together. Lift your
          finger to release.
        </p>
      </div>
      <div className="record-actions">
        <button onClick={download}>Export records</button>
        <button onClick={() => file.current?.click()}>Import records</button>
        <input
          ref={file}
          type="file"
          accept="application/json,.json"
          hidden
          onChange={upload}
        />
      </div>
      {status && <p role="status">{status}</p>}
      <OlderRecords records={records} />
      <p className="fine-print">
        Records and ghosts are stored on this device. Older records stay
        preserved; imported records require a fresh verified run for shared
        standings.
      </p>
    </Modal>
  );
}
