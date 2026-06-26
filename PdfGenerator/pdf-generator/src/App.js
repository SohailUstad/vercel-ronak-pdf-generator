import { useEffect, useMemo, useRef, useState } from 'react';
import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';
import './App.css';

const initialSlip = {
  vehicleNo: '',
  serialNo: '47926',
  date: new Date().toISOString().slice(0, 10),
  time: new Date().toTimeString().slice(0, 5),
  vehicleType: 'Truck',
  driver: 'OM',
  customerName: '',
  grossWeight: '',
  tareWeight: '',
  receivedAmount: '200',
};

const formatDate = (value) => {
  if (!value) return '';
  const [year, month, day] = value.split('-');
  return `${day}/${month}/${year.slice(2)}`;
};

const digitsOnly = (value) => value.replace(/[^\d]/g, '');
const decimalOnly = (value) => {
  const cleaned = value.replace(/[^\d.]/g, '');
  const [first, ...rest] = cleaned.split('.');
  return rest.length ? `${first}.${rest.join('')}` : first;
};
const toNumber = (value) => Number(value || 0);
const PDF_SETTINGS_KEY = 'maas-weighbridge-pdf-settings';

const pagePresets = {
  a4: { label: 'A4 landscape', width: 297, height: 210 },
  a5: { label: 'A5 landscape', width: 210, height: 148 },
  letter: { label: 'Letter landscape', width: 279.4, height: 215.9 },
  legal: { label: 'Legal landscape', width: 355.6, height: 215.9 },
};

const defaultPdfSettings = {
  pagePreset: 'a4',
  customUnit: 'mm',
  customWidth: '241',
  customHeight: '140',
  margin: '6',
};

const unitLabels = {
  mm: 'mm',
  cm: 'cm',
  in: 'in',
};
const SIDE_HOLES = Array.from({ length: 19 }, (_, index) => index);
const TRUCK_BODY_DOTS = Array.from({ length: 10 }, (_, row) => (
  Array.from({ length: 40 }, (__, column) => ({
    x: 22 + column * 3.2,
    y: 24 + row * 3.2,
  }))
)).flat();
const TRUCK_CABIN_DOTS = Array.from({ length: 14 }, (_, row) => (
  Array.from({ length: 15 }, (__, column) => {
    const x = 155.5 + column * 3;
    const y = 11.5 + row * 3;
    const insideLowerCabin = y >= 32 && x <= 198;
    const insideRoof = y < 32 && x >= 162 - (y - 11.5) * 0.38 && x <= 194 - (32 - y) * 0.08;
    const insideWindow = y >= 20 && y <= 30 && x >= 164 && x <= 189;
    return insideLowerCabin || insideRoof
      ? { x, y, hidden: insideWindow }
      : null;
  }).filter(Boolean)
)).flat();
const PDF_CAPTURE_SCALE = 3;
const DOT_FONT = {
  ' ': ['00000', '00000', '00000', '00000', '00000', '00000', '00000'],
  A: ['01110', '10001', '10001', '11111', '10001', '10001', '10001'],
  B: ['11110', '10001', '10001', '11110', '10001', '10001', '11110'],
  C: ['01111', '10000', '10000', '10000', '10000', '10000', '01111'],
  D: ['11110', '10001', '10001', '10001', '10001', '10001', '11110'],
  E: ['11111', '10000', '10000', '11110', '10000', '10000', '11111'],
  F: ['11111', '10000', '10000', '11110', '10000', '10000', '10000'],
  G: ['01111', '10000', '10000', '10111', '10001', '10001', '01111'],
  H: ['10001', '10001', '10001', '11111', '10001', '10001', '10001'],
  I: ['11111', '00100', '00100', '00100', '00100', '00100', '11111'],
  J: ['00111', '00010', '00010', '00010', '00010', '10010', '01100'],
  K: ['10001', '10010', '10100', '11000', '10100', '10010', '10001'],
  L: ['10000', '10000', '10000', '10000', '10000', '10000', '11111'],
  M: ['10001', '11011', '10101', '10101', '10001', '10001', '10001'],
  N: ['10001', '11001', '10101', '10011', '10001', '10001', '10001'],
  O: ['01110', '10001', '10001', '10001', '10001', '10001', '01110'],
  P: ['11110', '10001', '10001', '11110', '10000', '10000', '10000'],
  Q: ['01110', '10001', '10001', '10001', '10101', '10010', '01101'],
  R: ['11110', '10001', '10001', '11110', '10100', '10010', '10001'],
  S: ['01111', '10000', '10000', '01110', '00001', '00001', '11110'],
  T: ['11111', '00100', '00100', '00100', '00100', '00100', '00100'],
  U: ['10001', '10001', '10001', '10001', '10001', '10001', '01110'],
  V: ['10001', '10001', '10001', '10001', '10001', '01010', '00100'],
  W: ['10001', '10001', '10001', '10101', '10101', '10101', '01010'],
  X: ['10001', '10001', '01010', '00100', '01010', '10001', '10001'],
  Y: ['10001', '10001', '01010', '00100', '00100', '00100', '00100'],
  Z: ['11111', '00001', '00010', '00100', '01000', '10000', '11111'],
  0: ['01110', '10001', '10011', '10101', '11001', '10001', '01110'],
  1: ['00100', '01100', '00100', '00100', '00100', '00100', '01110'],
  2: ['01110', '10001', '00001', '00010', '00100', '01000', '11111'],
  3: ['11110', '00001', '00001', '01110', '00001', '00001', '11110'],
  4: ['00010', '00110', '01010', '10010', '11111', '00010', '00010'],
  5: ['11111', '10000', '10000', '11110', '00001', '00001', '11110'],
  6: ['01110', '10000', '10000', '11110', '10001', '10001', '01110'],
  7: ['11111', '00001', '00010', '00100', '01000', '01000', '01000'],
  8: ['01110', '10001', '10001', '01110', '10001', '10001', '01110'],
  9: ['01110', '10001', '10001', '01111', '00001', '00001', '01110'],
  '.': ['00000', '00000', '00000', '00000', '00000', '01100', '01100'],
  ',': ['00000', '00000', '00000', '00000', '00000', '01100', '01000'],
  '-': ['00000', '00000', '00000', '11111', '00000', '00000', '00000'],
  ':': ['00000', '01100', '01100', '00000', '01100', '01100', '00000'],
  '/': ['00001', '00010', '00010', '00100', '01000', '01000', '10000'],
  '|': ['00100', '00100', '00100', '00100', '00100', '00100', '00100'],
  "'": ['01100', '01100', '00100', '00000', '00000', '00000', '00000'],
  '&': ['01100', '10010', '10100', '01000', '10101', '10010', '01101'],
  '(': ['00010', '00100', '01000', '01000', '01000', '00100', '00010'],
  ')': ['01000', '00100', '00010', '00010', '00010', '00100', '01000'],
  '?': ['01110', '10001', '00001', '00010', '00100', '00000', '00100'],
};

function DotText({ text, pitch = 3, radius = 1, className = '' }) {
  const value = String(text ?? '').toUpperCase();
  const chars = [...value];
  const dots = chars.flatMap((char, charIndex) => {
    const pattern = DOT_FONT[char] || DOT_FONT['?'];
    const xOffset = charIndex * 6 * pitch;

    return pattern.flatMap((row, rowIndex) => (
      [...row].map((cell, columnIndex) => (
        cell === '1'
          ? { x: xOffset + columnIndex * pitch, y: rowIndex * pitch }
          : null
      )).filter(Boolean)
    ));
  });
  const viewWidth = Math.max(1, (chars.length * 6 - 1) * pitch);
  const viewHeight = 7 * pitch;

  return (
    <svg
      className={`dot-text ${className}`.trim()}
      viewBox={`${-radius} ${-radius} ${viewWidth + radius * 2} ${viewHeight + radius * 2}`}
      width={viewWidth + radius * 2}
      height={viewHeight + radius * 2}
      role="img"
      aria-label={String(text ?? '')}
      preserveAspectRatio="xMinYMid meet"
    >
      {dots.map((dot, index) => (
        <circle key={index} cx={dot.x} cy={dot.y} r={radius} fill="currentColor" />
      ))}
    </svg>
  );
}

const toMillimeters = (value, unit) => {
  const numericValue = Number(value) || 0;
  if (unit === 'cm') return numericValue * 10;
  if (unit === 'in') return numericValue * 25.4;
  return numericValue;
};

const fromMillimeters = (value, unit) => {
  if (unit === 'cm') return value / 10;
  if (unit === 'in') return value / 25.4;
  return value;
};

const formatMeasurement = (value) => {
  const rounded = Math.round(value * 1000) / 1000;
  return String(rounded).replace(/\.?0+$/, '');
};

const getStoredPdfSettings = () => {
  try {
    const saved = window.localStorage.getItem(PDF_SETTINGS_KEY);
    return saved ? { ...defaultPdfSettings, ...JSON.parse(saved) } : defaultPdfSettings;
  } catch {
    return defaultPdfSettings;
  }
};

function App() {
  const [slip, setSlip] = useState(initialSlip);
  const [pdfSettings, setPdfSettings] = useState(getStoredPdfSettings);
  const [isGenerating, setIsGenerating] = useState(false);
  const slipRef = useRef(null);

  const netWeight = useMemo(() => {
    const net = toNumber(slip.grossWeight) - toNumber(slip.tareWeight);
    return Number.isFinite(net) && net > 0 ? String(net) : '';
  }, [slip.grossWeight, slip.tareWeight]);

  const values = {
    gross: slip.grossWeight || '22980',
    tare: slip.tareWeight || '8170',
    net: netWeight || '14810',
    date: formatDate(slip.date),
    vehicleNo: slip.vehicleNo || 'MH14FM8937',
    customerName: slip.customerName || 'WALK-IN CUSTOMER',
  };
  const activeSizeUnit = pdfSettings.pagePreset === 'custom' ? pdfSettings.customUnit : 'mm';

  useEffect(() => {
    window.localStorage.setItem(PDF_SETTINGS_KEY, JSON.stringify(pdfSettings));
  }, [pdfSettings]);

  const setField = (name, value) => {
    setSlip((current) => ({ ...current, [name]: value }));
  };

  const handleChange = (event) => {
    const { name, value } = event.target;
    setField(name, value);
  };

  const handleUppercase = (event) => {
    const { name, value } = event.target;
    setField(name, value.toUpperCase());
  };

  const handleNumber = (event) => {
    const { name, value } = event.target;
    setField(name, digitsOnly(value));
  };

  const handlePdfSetting = (event) => {
    const { name, value } = event.target;
    if (name === 'pagePreset') {
      setPdfSettings((current) => {
        const currentUnit = current.pagePreset === 'custom' ? current.customUnit : 'mm';
        const nextUnit = value === 'custom' ? current.customUnit : 'mm';

        return {
          ...current,
          pagePreset: value,
          margin: formatMeasurement(fromMillimeters(toMillimeters(current.margin, currentUnit), nextUnit)),
        };
      });
      return;
    }

    if (name === 'customUnit') {
      setPdfSettings((current) => ({
        ...current,
        customUnit: value,
        customWidth: formatMeasurement(fromMillimeters(toMillimeters(current.customWidth, current.customUnit), value)),
        customHeight: formatMeasurement(fromMillimeters(toMillimeters(current.customHeight, current.customUnit), value)),
        margin: formatMeasurement(fromMillimeters(toMillimeters(current.margin, current.customUnit), value)),
      }));
      return;
    }

    setPdfSettings((current) => ({
      ...current,
      [name]: decimalOnly(value),
    }));
  };

  const getPdfPageSize = () => {
    if (pdfSettings.pagePreset !== 'custom') {
      return pagePresets[pdfSettings.pagePreset];
    }

    return {
      label: 'Custom',
      width: Math.max(toMillimeters(pdfSettings.customWidth, pdfSettings.customUnit), 50),
      height: Math.max(toMillimeters(pdfSettings.customHeight, pdfSettings.customUnit), 50),
    };
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (!slipRef.current) return;

    try {
      setIsGenerating(true);
      const pageSize = getPdfPageSize();
      const doc = new jsPDF({
        orientation: pageSize.width >= pageSize.height ? 'landscape' : 'portrait',
        unit: 'mm',
        format: [pageSize.width, pageSize.height],
        compress: true,
      });
      const pageWidth = doc.internal.pageSize.getWidth();
      const pageHeight = doc.internal.pageSize.getHeight();
      const margin = Math.max(toMillimeters(pdfSettings.margin, activeSizeUnit), 0);
      const maxWidth = pageWidth - margin * 2;
      const maxHeight = pageHeight - margin * 2;
      const sourceRatio = slipRef.current.offsetWidth / slipRef.current.offsetHeight;
      let imageWidth = maxWidth;
      let imageHeight = imageWidth / sourceRatio;

      if (imageHeight > maxHeight) {
        imageHeight = maxHeight;
        imageWidth = imageHeight * sourceRatio;
      }

      const canvas = await html2canvas(slipRef.current, {
        backgroundColor: '#ffffff',
        scale: PDF_CAPTURE_SCALE,
        useCORS: true,
        logging: false,
      });
      const imageData = canvas.toDataURL('image/png');
      const imageX = (pageWidth - imageWidth) / 2;
      const imageY = (pageHeight - imageHeight) / 2;

      doc.addImage(imageData, 'PNG', imageX, imageY, imageWidth, imageHeight, undefined, 'FAST');
      doc.save(`weighbridge-slip-${slip.vehicleNo || slip.serialNo}.pdf`);
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <main className="app-shell">
      <section className="form-panel">
        <p className="eyebrow">New MAAS format</p>
        <h1>Weighbridge PDF</h1>

        <form onSubmit={handleSubmit} className="slip-form">
          <label>
            Vehicle number
            <input name="vehicleNo" value={slip.vehicleNo} onChange={handleUppercase} required placeholder="MH14FM8937" />
          </label>
          <label>
            Serial number
            <input name="serialNo" value={slip.serialNo} onChange={handleNumber} required />
          </label>
          <label>
            Date
            <input name="date" type="date" value={slip.date} onChange={handleChange} required />
          </label>
          <label>
            Time
            <input name="time" type="time" value={slip.time} onChange={handleChange} required />
          </label>
          <label>
            Vehicle type
            <input name="vehicleType" value={slip.vehicleType} onChange={handleChange} required />
          </label>
          <label>
            Driver name
            <input name="driver" value={slip.driver} onChange={handleUppercase} required />
          </label>
          <label>
            Customer name
            <input name="customerName" value={slip.customerName} onChange={handleUppercase} placeholder="Optional" />
          </label>
          <label>
            Received amount
            <input name="receivedAmount" inputMode="numeric" value={slip.receivedAmount} onChange={handleNumber} required />
          </label>
          <label>
            Gross weight
            <input name="grossWeight" inputMode="numeric" value={slip.grossWeight} onChange={handleNumber} required placeholder="22980" />
          </label>
          <label>
            Tare weight
            <input name="tareWeight" inputMode="numeric" value={slip.tareWeight} onChange={handleNumber} required placeholder="8170" />
          </label>

          <div className="net-line">
            <span>Net weight</span>
            <strong>{netWeight || '0'} kg</strong>
          </div>

          <fieldset className="pdf-settings">
            <legend>PDF page setup</legend>
            <label>
              Page size
              <select name="pagePreset" value={pdfSettings.pagePreset} onChange={handlePdfSetting}>
                {Object.entries(pagePresets).map(([value, preset]) => (
                  <option key={value} value={value}>{preset.label}</option>
                ))}
                <option value="custom">Custom size</option>
              </select>
            </label>
            <label>
              Margin {unitLabels[activeSizeUnit]}
              <input name="margin" inputMode="decimal" value={pdfSettings.margin} onChange={handlePdfSetting} />
            </label>
            {pdfSettings.pagePreset === 'custom' && (
              <>
                <label>
                  Unit
                  <select name="customUnit" value={pdfSettings.customUnit} onChange={handlePdfSetting}>
                    <option value="mm">Millimeters</option>
                    <option value="cm">Centimeters</option>
                    <option value="in">Inches</option>
                  </select>
                </label>
                <label>
                  Width {unitLabels[pdfSettings.customUnit]}
                  <input name="customWidth" inputMode="decimal" value={pdfSettings.customWidth} onChange={handlePdfSetting} />
                </label>
                <label>
                  Height {unitLabels[pdfSettings.customUnit]}
                  <input name="customHeight" inputMode="decimal" value={pdfSettings.customHeight} onChange={handlePdfSetting} />
                </label>
              </>
            )}
          </fieldset>

          <button type="submit" disabled={isGenerating}>
            {isGenerating ? 'Generating PDF...' : 'Download PDF'}
          </button>
        </form>
      </section>

      <section className="preview-panel" aria-label="Slip preview">
        <div className="slip-preview" ref={slipRef}>
          <div className="side-holes side-holes-left" aria-hidden="true">
            {SIDE_HOLES.map((hole) => <span key={hole} />)}
          </div>
          <div className="side-holes side-holes-right" aria-hidden="true">
            {SIDE_HOLES.map((hole) => <span key={hole} />)}
          </div>

          <div className="side-rail">
            <span><DotText text="COMPUTERISED WEIGH BRIDGE" pitch={2.25} radius={0.8} /></span>
          </div>

          <header className="slip-header">
            <div>
              <h2><DotText text="MAAS INFRA AND LOGISTICS LTD." pitch={2.9} radius={1.05} /></h2>
              <p><DotText text="AN ISO 9001:2015 CERTIFIED WEIGHBRIDGE SLIP" pitch={1.85} radius={0.68} /></p>
            </div>
            <div className="om-mark">
              <img src={`${process.env.PUBLIC_URL}/pdfbox-dot-matrix/om-dot-matrix.png`} alt="Om" />
            </div>
            <div className="journey-mark">
              <strong><DotText text="HAPPY" pitch={3.1} radius={1.08} /></strong>
              <span><DotText text="JOURNEY" pitch={2.8} radius={0.98} /></span>
            </div>
            <div className="maas-mark"><DotText text="MAAS" pitch={4.5} radius={1.55} /></div>
          </header>

          <div className="truck-scene">
            <svg
              className="truck-art"
              viewBox="0 0 240 72"
              role="img"
              aria-label="Truck on weighbridge"
            >
              {TRUCK_BODY_DOTS.map((dot, index) => (
                <circle key={`body-${index}`} cx={dot.x} cy={dot.y} r="1.05" fill="#121820" />
              ))}
              {TRUCK_CABIN_DOTS.map((dot, index) => (
                !dot.hidden && <circle key={`cabin-${index}`} cx={dot.x} cy={dot.y} r="1.05" fill="#121820" />
              ))}
              <circle cx="57" cy="59" r="9" fill="#ffffff" stroke="#121820" strokeWidth="4" strokeDasharray="1.6 2.2" />
              <circle cx="167" cy="59" r="9" fill="#ffffff" stroke="#121820" strokeWidth="4" strokeDasharray="1.6 2.2" />
              <line x1="0" y1="69" x2="240" y2="69" stroke="#121820" strokeWidth="5" strokeDasharray="1.5 2.5" />
            </svg>
          </div>

          <div className="capacity-band">
            <DotText text="CAPACITY 150 TON | 20 METER LONG | 24 HOURS SERVICE" pitch={2.55} radius={0.92} />
          </div>

          <div className="detail-grid">
            <div><span><DotText text="Vehicle No." pitch={1.55} radius={0.55} /></span><b><DotText text={values.vehicleNo} pitch={2.05} radius={0.75} /></b></div>
            <div><span><DotText text="Serial No." pitch={1.55} radius={0.55} /></span><b><DotText text={slip.serialNo} pitch={2.05} radius={0.75} /></b></div>
            <div><span><DotText text="Date" pitch={1.55} radius={0.55} /></span><b><DotText text={values.date} pitch={2.05} radius={0.75} /></b></div>
            <div><span><DotText text="Time" pitch={1.55} radius={0.55} /></span><b><DotText text={slip.time} pitch={2.05} radius={0.75} /></b></div>
            <div><span><DotText text="Type" pitch={1.55} radius={0.55} /></span><b><DotText text={slip.vehicleType} pitch={2.05} radius={0.75} /></b></div>
            <div><span><DotText text="Driver" pitch={1.55} radius={0.55} /></span><b><DotText text={slip.driver} pitch={2.05} radius={0.75} /></b></div>
          </div>

          <div className="weight-cards">
            <article className="weight-card gross-card">
              <span><DotText text="GROSS KG" pitch={2} radius={0.72} /></span>
              <b><DotText text={values.gross} pitch={4.55} radius={1.55} /></b>
            </article>
            <article className="weight-card tare-card">
              <span><DotText text="TARE KG" pitch={2} radius={0.72} /></span>
              <b><DotText text={values.tare} pitch={4.55} radius={1.55} /></b>
            </article>
            <article className="weight-card net-card">
              <span><DotText text="NET KG" pitch={2} radius={0.72} /></span>
              <b><DotText text={values.net} pitch={4.55} radius={1.55} /></b>
            </article>
            <article className="amount-card">
              <span><DotText text="RECEIVED RS." pitch={1.85} radius={0.66} /></span>
              <b><DotText text={slip.receivedAmount} pitch={4.55} radius={1.55} /></b>
            </article>
          </div>

          <div className="customer-line">
            <span><DotText text="Customer" pitch={1.65} radius={0.58} /></span>
            <b><DotText text={values.customerName} pitch={2.1} radius={0.76} /></b>
          </div>

          <p className="notice-line">
            <DotText text="Record will not be available after one month. Goods are weighed and kept at owner risk." pitch={1.55} radius={0.55} />
          </p>

          <footer className="slip-footer">
            <div><DotText text="Registered Office: Mumbai, Maharashtra | Total Logistics Solution" pitch={1.45} radius={0.52} /></div>
            <div><DotText text="Driver's Signature" pitch={1.65} radius={0.58} /></div>
            <div><DotText text="Operator's Signature" pitch={1.65} radius={0.58} /></div>
          </footer>
        </div>
      </section>
    </main>
  );
}

export default App;
