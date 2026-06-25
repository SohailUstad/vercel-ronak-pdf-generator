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
      const canvas = await html2canvas(slipRef.current, {
        backgroundColor: '#ffffff',
        scale: 3,
        useCORS: true,
        logging: false,
      });
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
      const sourceRatio = canvas.width / canvas.height;
      let imageWidth = maxWidth;
      let imageHeight = imageWidth / sourceRatio;

      if (imageHeight > maxHeight) {
        imageHeight = maxHeight;
        imageWidth = imageHeight * sourceRatio;
      }

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
            <span>COMPUTERISED WEIGH BRIDGE</span>
          </div>

          <header className="slip-header">
            <div>
              <h2>MAAS INFRA AND LOGISTICS LTD.</h2>
              <p>An ISO 9001:2015 Certified weighbridge slip</p>
            </div>
            <div className="om-mark">ॐ</div>
            <div className="journey-mark">
              <strong>Happy Journey</strong>
              <span>शुभ यात्रा</span>
            </div>
            <div className="maas-mark">MAAS</div>
          </header>

          <div className="truck-scene">
            <div className="truck-body" />
            <div className="truck-cabin" />
            <div className="truck-window" />
            <span className="wheel wheel-one" />
            <span className="wheel wheel-two" />
            <span className="bridge-line" />
          </div>

          <div className="capacity-band">CAPACITY 150 TON | 20 METER LONG | 24 HOURS SERVICE</div>

          <div className="detail-grid">
            <div><span>Vehicle No.</span><b>{values.vehicleNo}</b></div>
            <div><span>Serial No.</span><b>{slip.serialNo}</b></div>
            <div><span>Date</span><b>{values.date}</b></div>
            <div><span>Time</span><b>{slip.time}</b></div>
            <div><span>Type</span><b>{slip.vehicleType}</b></div>
            <div><span>Driver</span><b>{slip.driver}</b></div>
          </div>

          <div className="weight-cards">
            <article className="weight-card gross-card">
              <span>GROSS KG</span>
              <b>{values.gross}</b>
            </article>
            <article className="weight-card tare-card">
              <span>TARE KG</span>
              <b>{values.tare}</b>
            </article>
            <article className="weight-card net-card">
              <span>NET KG</span>
              <b>{values.net}</b>
            </article>
            <article className="amount-card">
              <span>RECEIVED Rs.</span>
              <b>{slip.receivedAmount}</b>
            </article>
          </div>

          <div className="customer-line">
            <span>Customer</span>
            <b>{values.customerName}</b>
          </div>

          <p className="notice-line">
            Record will not be available after one month. Goods are weighed and kept at owner risk.
          </p>

          <footer className="slip-footer">
            <div>Registered Office: Mumbai, Maharashtra | Total Logistics Solution</div>
            <div>Driver's Signature</div>
            <div>Operator's Signature</div>
          </footer>

        </div>
      </section>
    </main>
  );
}

export default App;
