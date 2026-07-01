import { useEffect, useMemo, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import './App.css';

const initialSlip = {
  vehicleNo: '',
  serialNo: '47926',
  inDate: new Date().toISOString().slice(0, 10),
  inTime: new Date().toTimeString().slice(0, 5),
  outDate: new Date().toISOString().slice(0, 10),
  outTime: new Date().toTimeString().slice(0, 5),
  vehicleType: 'Truck',
  driver: 'OM',
  customerName: '',
  grossWeight: '',
  tareWeight: '',
  receivedAmount: '200',
  weightCharge: '200',
};

const formatDate = (value) => {
  if (!value) return '';
  const [year, month, day] = value.split('-');
  return `${day}/${month}/${year.slice(2)}`;
};

const parseDateTime = (dateValue, timeValue) => {
  if (!dateValue || !timeValue) return null;
  const dateTime = new Date(`${dateValue}T${timeValue}`);
  return Number.isNaN(dateTime.getTime()) ? null : dateTime;
};

const formatInputDate = (dateValue) => {
  const year = dateValue.getFullYear();
  const month = String(dateValue.getMonth() + 1).padStart(2, '0');
  const day = String(dateValue.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const getNextDate = (dateValue) => {
  const date = new Date(`${dateValue}T00:00`);
  date.setDate(date.getDate() + 1);
  return formatInputDate(date);
};

const formatTime12 = (value, includeSeconds = false) => {
  if (!value) return '';
  const [hourText = '0', minuteText = '00'] = value.split(':');
  const hour = Number(hourText);
  const suffix = hour >= 12 ? 'PM' : 'AM';
  const hour12 = hour % 12 || 12;
  const time = `${String(hour12).padStart(2, '0')}:${minuteText.padStart(2, '0')}`;
  return includeSeconds ? `${time}:00 ${suffix}` : `${time} ${suffix}`;
};

const digitsOnly = (value) => value.replace(/[^\d]/g, '');
const decimalOnly = (value) => {
  const cleaned = value.replace(/[^\d.]/g, '');
  const [first, ...rest] = cleaned.split('.');
  return rest.length ? `${first}.${rest.join('')}` : first;
};
const toNumber = (value) => Number(value || 0);
const PDF_SETTINGS_KEY = 'maas-weighbridge-pdf-settings';
const SLIP_LAYOUT_KEY = 'maas-weighbridge-slip-layout';

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
const waitForNextPaint = () => new Promise((resolve) => {
  requestAnimationFrame(() => requestAnimationFrame(resolve));
});
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
  const paddedWidth = viewWidth + radius * 4;
  const paddedHeight = viewHeight + radius * 4;

  return (
    <svg
      className={`dot-text ${className}`.trim()}
      viewBox={`${-radius * 2} ${-radius * 2} ${paddedWidth} ${paddedHeight}`}
      width={paddedWidth}
      height={paddedHeight}
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

const getPrintableStyles = () => (
  Array.from(document.styleSheets).map((styleSheet) => {
    try {
      return Array.from(styleSheet.cssRules).map((rule) => rule.cssText).join('\n');
    } catch {
      return '';
    }
  }).filter(Boolean).join('\n')
);

const formatLongDate = (value) => {
  if (!value) return '';
  const [year, month, day] = value.split('-');
  return `${day}/${month}/${year}`;
};

const getStoredPdfSettings = () => {
  try {
    const saved = window.localStorage.getItem(PDF_SETTINGS_KEY);
    return saved ? { ...defaultPdfSettings, ...JSON.parse(saved) } : defaultPdfSettings;
  } catch {
    return defaultPdfSettings;
  }
};

const getStoredSlipLayout = () => {
  try {
    return window.localStorage.getItem(SLIP_LAYOUT_KEY) || 'layout1';
  } catch {
    return 'layout1';
  }
};

function MiniWeightMark({ type }) {
  const truckDots = [
    ...Array.from({ length: 5 }, (_, row) => (
      Array.from({ length: 20 }, (__, column) => ({ x: 4 + column * 1.85, y: 6 + row * 1.85 }))
    )).flat(),
    ...Array.from({ length: 6 }, (_, row) => (
      Array.from({ length: 6 }, (__, column) => {
        const x = 47 + column * 1.85;
        const y = 4 + row * 1.85;
        return y < 8 && x < 52 ? null : { x, y };
      }).filter(Boolean)
    )).flat(),
  ];
  const tareDots = Array.from({ length: 10 }, (_, row) => (
    Array.from({ length: 20 }, (__, column) => {
      const x = 10 + column * 1.75;
      const y = 3 + row * 1.65;
      const dx = (column - 9.5) / 9.5;
      const dy = (row - 4.5) / 4.5;
      const noisyEdge = (row + column) % 5 === 0 ? 0.14 : 0;
      return dx * dx + dy * dy < 1 + noisyEdge ? { x, y } : null;
    }).filter(Boolean)
  )).flat();
  const netDots = [
    ...Array.from({ length: 5 }, (_, row) => (
      Array.from({ length: 18 }, (__, column) => ({ x: 10 + column * 1.9, y: 5 + row * 1.9 }))
    )).flat(),
    ...Array.from({ length: 14 }, (_, index) => ({ x: 12 + index * 2.7, y: 19 })),
  ];
  const dotsByType = {
    gross: truckDots,
    tare: tareDots,
    net: netDots,
  };

  return (
    <svg className="mini-weight-mark" viewBox="0 0 66 30" aria-hidden="true">
      {(dotsByType[type] || netDots).map((dot, index) => (
        <circle key={index} cx={dot.x} cy={dot.y} r="0.82" fill="currentColor" />
      ))}
      {type === 'gross' && (
        <>
          <circle cx="16" cy="20" r="3.7" fill="none" stroke="currentColor" strokeWidth="1.5" strokeDasharray="0.8 1.4" />
          <circle cx="52" cy="20" r="3.7" fill="none" stroke="currentColor" strokeWidth="1.5" strokeDasharray="0.8 1.4" />
        </>
      )}
    </svg>
  );
}

function App() {
  const [slip, setSlip] = useState(initialSlip);
  const [pdfSettings, setPdfSettings] = useState(getStoredPdfSettings);
  const [slipLayout, setSlipLayout] = useState(getStoredSlipLayout);
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
    inDate: formatDate(slip.inDate),
    outDate: formatDate(slip.outDate),
    longInDate: formatLongDate(slip.inDate),
    longOutDate: formatLongDate(slip.outDate),
    inTime: formatTime12(slip.inTime),
    outTime: formatTime12(slip.outTime),
    inTimeWithSeconds: formatTime12(slip.inTime, true),
    outTimeWithSeconds: formatTime12(slip.outTime, true),
    vehicleNo: slip.vehicleNo || 'MH14FM8937',
    customerName: slip.customerName || 'WALK-IN CUSTOMER',
  };
  const activeSizeUnit = pdfSettings.pagePreset === 'custom' ? pdfSettings.customUnit : 'mm';

  useEffect(() => {
    window.localStorage.setItem(PDF_SETTINGS_KEY, JSON.stringify(pdfSettings));
  }, [pdfSettings]);

  useEffect(() => {
    window.localStorage.setItem(SLIP_LAYOUT_KEY, slipLayout);
  }, [slipLayout]);

  const normalizeSlipTiming = (slipValue) => {
    const inDateTime = parseDateTime(slipValue.inDate, slipValue.inTime);
    const outDateTime = parseDateTime(slipValue.outDate, slipValue.outTime);

    if (!inDateTime || !outDateTime || outDateTime > inDateTime) {
      return slipValue;
    }

    return {
      ...slipValue,
      outDate: getNextDate(slipValue.inDate),
    };
  };

  const setField = (name, value) => {
    setSlip((current) => {
      const next = { ...current, [name]: value };
      return ['inDate', 'inTime', 'outDate', 'outTime'].includes(name)
        ? normalizeSlipTiming(next)
        : next;
    });
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

  const getPdfPayload = () => {
    const receipt = slipRef.current.cloneNode(true);
    const pageSize = getPdfPageSize();
    const margin = Math.max(toMillimeters(pdfSettings.margin, activeSizeUnit), 0);
    const sourceWidth = slipRef.current.offsetWidth;
    const sourceHeight = slipRef.current.offsetHeight;

    receipt.style.width = `${sourceWidth}px`;
    receipt.style.height = `${sourceHeight}px`;
    receipt.style.minWidth = `${sourceWidth}px`;
    receipt.querySelectorAll('img').forEach((image) => {
      image.setAttribute('src', image.src);
    });

    return {
      html: receipt.outerHTML,
      css: getPrintableStyles(),
      pageWidth: pageSize.width,
      pageHeight: pageSize.height,
      margin,
      sourceWidth,
      sourceHeight,
      origin: window.location.origin,
      fileName: `weighbridge-slip-${slip.vehicleNo || slip.serialNo}.pdf`,
    };
  };

  const downloadPdf = async () => {
    const payload = getPdfPayload();
    const response = await fetch('/api/generate-pdf', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      throw new Error('PDF generation failed. Please try again.');
    }

    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = payload.fileName;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (!slipRef.current) return;

    try {
      flushSync(() => {
        setIsGenerating(true);
      });
      await waitForNextPaint();
      await downloadPdf();
    } catch (error) {
      window.alert(error.message || 'PDF generation failed.');
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
            In date
            <input name="inDate" type="date" value={slip.inDate} onChange={handleChange} required />
          </label>
          <label>
            In time
            <input name="inTime" type="time" value={slip.inTime} onChange={handleChange} required />
          </label>
          <label>
            Out date
            <input name="outDate" type="date" value={slip.outDate} onChange={handleChange} required />
          </label>
          <label>
            Out time
            <input name="outTime" type="time" value={slip.outTime} onChange={handleChange} required />
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
            Weight charges
            <input name="weightCharge" inputMode="numeric" value={slip.weightCharge} onChange={handleNumber} required />
          </label>
          <label>
            Gross weight
            <input name="grossWeight" inputMode="numeric" value={slip.grossWeight} onChange={handleNumber} required placeholder="22980" />
          </label>
          <label>
            Tare weight
            <input name="tareWeight" inputMode="numeric" value={slip.tareWeight} onChange={handleNumber} required placeholder="8170" />
          </label>
          <label>
            Slip layout
            <select value={slipLayout} onChange={(event) => setSlipLayout(event.target.value)}>
              <option value="layout1">Layout 1 - MAAS format</option>
              <option value="layout2">Layout 2 - OM receipt</option>
            </select>
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

          <button type="submit" disabled={isGenerating} aria-busy={isGenerating}>
            <span className="button-content" aria-live="polite">
              {isGenerating && <span className="button-spinner" aria-hidden="true" />}
              <span>{isGenerating ? 'Generating PDF...' : 'Download PDF'}</span>
            </span>
          </button>
        </form>
      </section>

      <section className="preview-panel" aria-label="Slip preview">
        {slipLayout === 'layout1' ? (
        <div className="slip-preview" ref={slipRef} data-pdf-slip="active">
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
                <circle key={`body-${index}`} cx={dot.x} cy={dot.y} r="1.05" fill="currentColor" />
              ))}
              {TRUCK_CABIN_DOTS.map((dot, index) => (
                !dot.hidden && <circle key={`cabin-${index}`} cx={dot.x} cy={dot.y} r="1.05" fill="currentColor" />
              ))}
              <circle cx="57" cy="59" r="9" fill="var(--paper)" stroke="currentColor" strokeWidth="4" strokeDasharray="1.6 2.2" />
              <circle cx="167" cy="59" r="9" fill="var(--paper)" stroke="currentColor" strokeWidth="4" strokeDasharray="1.6 2.2" />
              <line x1="0" y1="69" x2="240" y2="69" stroke="currentColor" strokeWidth="5" strokeDasharray="1.5 2.5" />
            </svg>
          </div>

          <div className="capacity-band">
            <DotText text="CAPACITY 150 TON | 20 METER LONG | 24 HOURS SERVICE" pitch={2.55} radius={0.92} />
          </div>

          <div className="detail-grid">
            <div><span><DotText text="Vehicle No." pitch={1.55} radius={0.55} /></span><b><DotText text={values.vehicleNo} pitch={2.05} radius={0.75} /></b></div>
            <div><span><DotText text="Serial No." pitch={1.55} radius={0.55} /></span><b><DotText text={slip.serialNo} pitch={2.05} radius={0.75} /></b></div>
            <div><span><DotText text="In Date" pitch={1.55} radius={0.55} /></span><b><DotText text={values.inDate} pitch={2.05} radius={0.75} /></b></div>
            <div><span><DotText text="In Time" pitch={1.55} radius={0.55} /></span><b><DotText text={values.inTime} pitch={1.8} radius={0.66} /></b></div>
            <div><span><DotText text="Out Date" pitch={1.55} radius={0.55} /></span><b><DotText text={values.outDate} pitch={2.05} radius={0.75} /></b></div>
            <div><span><DotText text="Out Time" pitch={1.55} radius={0.55} /></span><b><DotText text={values.outTime} pitch={1.8} radius={0.66} /></b></div>
            <div className="detail-wide"><span><DotText text="Type" pitch={1.55} radius={0.55} /></span><b><DotText text={slip.vehicleType} pitch={2.05} radius={0.75} /></b></div>
            <div className="detail-wide"><span><DotText text="Driver" pitch={1.55} radius={0.55} /></span><b><DotText text={slip.driver} pitch={2.05} radius={0.75} /></b></div>
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
        ) : (
        <div className="slip-preview slip-preview-layout2" ref={slipRef} data-pdf-slip="active">
          <div className="side-holes side-holes-left" aria-hidden="true">
            {SIDE_HOLES.map((hole) => <span key={hole} />)}
          </div>
          <div className="side-holes side-holes-right" aria-hidden="true">
            {SIDE_HOLES.map((hole) => <span key={hole} />)}
          </div>

          <div className="layout2-content">
            <div className="layout2-top-rule" />
            <header className="layout2-header">
              <div className="layout2-om-box">
                <img src={`${process.env.PUBLIC_URL}/pdfbox-dot-matrix/om-dot-matrix.png`} alt="Om" />
              </div>
              <div className="layout2-title-block">
                <DotText text="OM WEIGH BRIDGE" pitch={2.45} radius={0.9} />
                <DotText text="SAPAOUND POST: KHURS. TEL: WADA, PALGHAR-421312" pitch={1.45} radius={0.52} />
                <DotText text="NR. MULTISTEEL COMP. H.O.M: 9322967134, 9898527, 9637340876" pitch={1.35} radius={0.48} />
              </div>
              <div className="layout2-service-box">
                <DotText text="24 HOURS" pitch={1.7} radius={0.6} />
                <DotText text="SERVICE" pitch={1.7} radius={0.6} />
                <span />
                <DotText text="100 TONS" pitch={1.7} radius={0.6} />
                <DotText text="CAPACITY" pitch={1.7} radius={0.6} />
              </div>
            </header>

            <div className="layout2-meta">
              <span><DotText text={`VEHICLE NO: ${values.vehicleNo}`} pitch={1.45} radius={0.52} /></span>
              <span className="layout2-date-head"><DotText text="DATE" pitch={1.45} radius={0.52} /></span>
              <span className="layout2-time-head"><DotText text="TIME" pitch={1.45} radius={0.52} /></span>
              <span><DotText text={`SRNO: ${slip.serialNo}`} pitch={1.45} radius={0.52} /></span>
            </div>

            <div className="layout2-weights">
              <div className="layout2-weight-row">
                <MiniWeightMark type="gross" />
                <DotText text="GROSS WEIGHT:" pitch={1.45} radius={0.52} />
                <DotText text={`${values.gross}KG`} pitch={1.45} radius={0.52} />
                <DotText text={values.longInDate} pitch={1.45} radius={0.52} />
                <DotText text={values.inTimeWithSeconds} pitch={1.45} radius={0.52} />
              </div>
              <div className="layout2-weight-row">
                <MiniWeightMark type="tare" />
                <DotText text="TARE WEIGHT:" pitch={1.45} radius={0.52} />
                <DotText text={`${values.tare}KG`} pitch={1.45} radius={0.52} />
                <DotText text={values.longOutDate} pitch={1.45} radius={0.52} />
                <DotText text={values.outTimeWithSeconds} pitch={1.45} radius={0.52} />
              </div>
              <div className="layout2-weight-row">
                <MiniWeightMark type="net" />
                <DotText text="NET WEIGHT:" pitch={1.45} radius={0.52} />
                <DotText text={`${values.net}KG`} pitch={1.45} radius={0.52} />
              </div>
            </div>

            <div className="layout2-customer-row">
              <DotText text={`CUSTOMER NAME: ${values.customerName}`} pitch={1.45} radius={0.52} />
              <DotText text={`WEIGHT CHARGES: ${slip.weightCharge}/-`} pitch={1.45} radius={0.52} />
            </div>
            <div className="layout2-cash-row">
              <DotText text="CASH MEMO" pitch={1.65} radius={0.6} />
            </div>
            <div className="layout2-address-row">
              <DotText text="ADDRESS:" pitch={1.45} radius={0.52} />
              <DotText text={`TOTAL CHARGES: ${slip.receivedAmount}/-`} pitch={1.45} radius={0.52} />
            </div>

            <div className="layout2-note">
              <DotText text="Please Note:" pitch={1.25} radius={0.45} />
              <DotText text="1) Please check the weight, no responsibility accepted once carrier leaves the weighbridge." pitch={1.12} radius={0.4} />
              <DotText text="2) When tare weight is oral it is stated by driver / owner of the vehicle." pitch={1.12} radius={0.4} />
              <DotText text="3) Record will not be available after one month." pitch={1.12} radius={0.4} />
            </div>
          </div>
        </div>
        )}
      </section>
    </main>
  );
}

export default App;
