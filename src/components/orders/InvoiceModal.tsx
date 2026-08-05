import React, { useState, useEffect, useRef } from 'react';
import { doc, runTransaction, serverTimestamp } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { Order } from '../../types';
import { QRCodeSVG } from 'qrcode.react';
import { SkyLogo } from '../common/SkyLogo';
import { Download, Printer, X, Loader2, FileText, CheckCircle2 } from 'lucide-react';
import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';

interface InvoiceModalProps {
  order: Order | null;
  isOpen: boolean;
  onClose: () => void;
  onInvoiceGenerated?: (updatedOrder: Order) => void;
}

export const InvoiceModal: React.FC<InvoiceModalProps> = ({
  order,
  isOpen,
  onClose,
  onInvoiceGenerated,
}) => {
  const [invoiceNumber, setInvoiceNumber] = useState<string>('');
  const [invoiceDate, setInvoiceDate] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(true);
  const [downloadingPdf, setDownloadingPdf] = useState<boolean>(false);
  const [error, setError] = useState<string>('');

  const printRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (isOpen && order) {
      initInvoice();
    }
  }, [isOpen, order?.id]);

  const initInvoice = async () => {
    if (!order) return;
    setLoading(true);
    setError('');

    try {
      if (order.invoiceNumber) {
        setInvoiceNumber(order.invoiceNumber);
        const dateObj = order.invoiceGeneratedAt?.toDate
          ? order.invoiceGeneratedAt.toDate()
          : new Date(order.invoiceGeneratedAt || order.createdAt || Date.now());
        setInvoiceDate(dateObj.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }));
        setLoading(false);
      } else {
        // Auto-generate incrementing Invoice Number using Firestore transaction
        let newInvNumber = '';
        await runTransaction(db, async (transaction) => {
          const counterRef = doc(db, 'counters', 'invoiceCounter');
          const counterSnap = await transaction.get(counterRef);

          let currentCount = 0;
          if (counterSnap.exists()) {
            currentCount = counterSnap.data().lastNumber || 0;
          }

          const nextCount = currentCount + 1;
          newInvNumber = `SAT-INV-${String(nextCount).padStart(6, '0')}`;

          transaction.set(counterRef, { lastNumber: nextCount }, { merge: true });

          const orderRef = doc(db, 'orders', order.id);
          transaction.update(orderRef, {
            invoiceNumber: newInvNumber,
            invoiceGeneratedAt: serverTimestamp(),
          });
        });

        const todayStr = new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
        setInvoiceNumber(newInvNumber);
        setInvoiceDate(todayStr);

        const updated = {
          ...order,
          invoiceNumber: newInvNumber,
          invoiceGeneratedAt: new Date(),
        };
        if (onInvoiceGenerated) {
          onInvoiceGenerated(updated);
        }
        setLoading(false);
      }
    } catch (err: any) {
      console.error('Error generating invoice:', err);
      setError('Failed to generate invoice number. Please try again.');
      setLoading(false);
    }
  };

  const handleDownloadPDF = async () => {
    if (!printRef.current) return;
    setDownloadingPdf(true);
    try {
      const element = printRef.current;
      const canvas = await html2canvas(element, {
        scale: 2,
        useCORS: true,
        logging: false,
        backgroundColor: '#ffffff',
      });

      const imgData = canvas.toDataURL('image/png');
      const pdf = new jsPDF('p', 'mm', 'a4');
      const pdfWidth = pdf.internal.pageSize.getWidth();
      const pdfHeight = (canvas.height * pdfWidth) / canvas.width;

      pdf.addImage(imgData, 'PNG', 0, 0, pdfWidth, pdfHeight);
      pdf.save(`${invoiceNumber || 'SAT-INVOICE'}.pdf`);
    } catch (err) {
      console.error('Error generating PDF:', err);
    } finally {
      setDownloadingPdf(false);
    }
  };

  const handlePrint = () => {
    window.print();
  };

  if (!isOpen || !order) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/80 backdrop-blur-xs overflow-y-auto">
      <div className="relative w-full max-w-3xl bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden my-6">
        {/* Modal Header */}
        <div className="flex items-center justify-between px-6 py-4 bg-slate-900 text-white print:hidden">
          <div className="flex items-center gap-2">
            <FileText className="w-5 h-5 text-blue-400" />
            <h3 className="font-bold text-base">Tax Invoice Preview</h3>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handlePrint}
              disabled={loading}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold rounded-lg transition-colors border border-slate-700"
              title="Print Invoice"
            >
              <Printer className="w-4 h-4 text-blue-400" />
              <span>Print</span>
            </button>
            <button
              onClick={handleDownloadPDF}
              disabled={loading || downloadingPdf}
              className="flex items-center gap-1.5 px-3.5 py-1.5 bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold rounded-lg transition-colors shadow-sm"
              title="Download PDF"
            >
              {downloadingPdf ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Download className="w-4 h-4" />
              )}
              <span>Download PDF</span>
            </button>
            <button
              onClick={onClose}
              className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors ml-2"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Modal Body / Invoice Document */}
        <div className="p-6 md:p-8 overflow-y-auto max-h-[80vh] bg-slate-50 print:bg-white print:p-0 print:max-h-none">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-20 text-slate-500 space-y-3">
              <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
              <p className="text-xs font-semibold">Generating invoice details...</p>
            </div>
          ) : error ? (
            <div className="p-6 bg-rose-50 border border-rose-200 rounded-xl text-rose-700 text-xs font-medium text-center">
              {error}
            </div>
          ) : (
            /* Printable Invoice Container */
            <div
              id="invoice-document"
              ref={printRef}
              className="bg-white p-8 md:p-10 border border-slate-200 rounded-2xl shadow-sm text-slate-800 font-sans mx-auto max-w-2xl print:border-none print:shadow-none print:p-6"
            >
              {/* Header */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-6 border-b-2 border-slate-900 gap-4">
                <div>
                  <div className="mb-2">
                    <SkyLogo size="md" showText={true} lightMode={true} />
                  </div>
                  <p className="text-[11px] text-slate-500 leading-snug">
                    House-12, Road-04, Block-B, Mirpur, Dhaka, Bangladesh<br />
                    Phone: 01577351518, 01571542070 | Email: skyautomationtech@gmail.com
                  </p>
                </div>

                <div className="text-left sm:text-right shrink-0">
                  <span className="inline-block bg-slate-900 text-white text-[11px] font-bold px-3 py-1 rounded-md uppercase tracking-wider mb-1">
                    INVOICE
                  </span>
                  <p className="text-xs font-mono font-bold text-slate-900">{invoiceNumber}</p>
                  <p className="text-[11px] text-slate-500 font-medium">Date: {invoiceDate}</p>
                </div>
              </div>

              {/* Sub-Header / Customer & Order Meta */}
              <div className="grid grid-cols-2 gap-6 py-6 border-b border-slate-100 text-xs">
                <div>
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-1">
                    Billed To (Customer):
                  </span>
                  <p className="font-bold text-slate-900 text-sm">{order.customerName}</p>
                  <p className="font-mono text-slate-600 mt-0.5">{order.customerPhone}</p>
                  <p className="text-slate-600 leading-relaxed mt-1 max-w-xs">{order.customerAddress}</p>
                </div>

                <div className="text-right">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-1">
                    Order Reference:
                  </span>
                  <p className="font-semibold text-slate-800">Order ID: <span className="font-mono font-bold text-slate-900">{order.orderNumber}</span></p>
                  <p className="text-slate-600 mt-0.5">Reseller: <span className="font-medium text-slate-900">{order.resellerName}</span></p>
                  <p className="text-slate-500 text-[11px]">{order.resellerShopName}</p>
                </div>
              </div>

              {/* Items Table */}
              <div className="py-6">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="border-b-2 border-slate-200 text-slate-500 uppercase tracking-wider text-[10px]">
                      <th className="py-2.5 font-bold">Item Description</th>
                      <th className="py-2.5 px-3 text-center font-bold">Qty</th>
                      <th className="py-2.5 px-3 text-right font-bold">Unit Price</th>
                      <th className="py-2.5 text-right font-bold">Total</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    <tr>
                      <td className="py-3.5 pr-3">
                        <p className="font-bold text-slate-900 text-xs">{order.productName}</p>
                        {order.variantColorName && (
                          <span className="inline-block text-[10px] font-semibold text-amber-700 bg-amber-50 px-1.5 py-0.5 rounded mt-1 border border-amber-200">
                            Color: {order.variantColorName}
                          </span>
                        )}
                      </td>
                      <td className="py-3.5 px-3 text-center font-bold text-slate-800">{order.quantity}</td>
                      <td className="py-3.5 px-3 text-right font-medium text-slate-700">৳{(order.sellingPrice !== undefined ? order.sellingPrice : order.unitRetailPrice).toLocaleString()}</td>
                      <td className="py-3.5 text-right font-bold text-slate-900">৳{order.totalAmount.toLocaleString()}</td>
                    </tr>
                  </tbody>
                </table>
              </div>

              {/* Total Summary */}
              <div className="flex items-center justify-between pt-4 border-t-2 border-slate-900 bg-slate-50/50 p-4 rounded-xl">
                <div>
                  <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider block">Payment Status</span>
                  <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-700 uppercase">
                    <CheckCircle2 className="w-3.5 h-3.5" /> {order.paymentStatus || 'Paid'}
                  </span>
                </div>

                <div className="text-right">
                  <span className="text-xs text-slate-500 font-medium mr-4">Total Amount Due:</span>
                  <span className="text-xl font-extrabold text-slate-900">৳{order.totalAmount.toLocaleString()}</span>
                </div>
              </div>

              {/* Footer & QR Code */}
              <div className="mt-8 pt-6 border-t border-slate-100 flex items-center justify-between text-xs">
                <div className="max-w-xs space-y-1">
                  <p className="font-bold text-slate-900">Thank you for your business!</p>
                  <p className="text-[10px] text-slate-500 leading-normal">
                    Warranty Note: Warranty claims require valid invoice verification. Standard product manufacturer warranty terms apply.
                  </p>
                </div>

                <div className="flex flex-col items-center bg-slate-50 p-2.5 rounded-xl border border-slate-200">
                  <QRCodeSVG value={invoiceNumber || 'SAT-INVOICE'} size={60} level="M" />
                  <span className="text-[9px] font-mono font-bold text-slate-600 mt-1">{invoiceNumber}</span>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="px-6 py-4 bg-slate-100 border-t border-slate-200 flex justify-end gap-3 print:hidden">
          <button
            onClick={onClose}
            className="px-5 py-2 bg-slate-800 hover:bg-slate-700 text-white font-bold text-xs rounded-xl transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
