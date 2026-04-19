'use client';

import React, { JSX, useEffect, useState } from 'react';
import mammoth from 'mammoth';
import * as XLSX from 'xlsx';
import JSZip from 'jszip';
import Header from "@/app/components/header";

type SheetRows = Array<Array<string | number | boolean | null | undefined>>;

function formatXmlSlideText(xmlText: string): string[] {
    const parser = new DOMParser();
    const xml = parser.parseFromString(xmlText, "application/xml");
    const texts: string[] = [];
    const nodes = Array.from(xml.getElementsByTagName("*"));

    for (const node of nodes) {
        if (node.localName === "t") {
            const value = node.textContent?.trim();
            if (value) texts.push(value);
        }
    }

    return texts;
}

export default function DocsViewerPage() {
    const [content, setContent] = useState<JSX.Element | null>(null);
    const [companyName, setCompanyName] = useState<string>("");
    const [name, setName] = useState<string>('');

    useEffect(() => {
        if (typeof window !== "undefined") {
            const storedCompanyName = localStorage.getItem("companyName") || "";
            setCompanyName(storedCompanyName);
        }
    }, []);

    useEffect(() => {
        const fileUrl = sessionStorage.getItem('viewerFileUrl');
        const currentName = (sessionStorage.getItem('viewerFileName') as string) ?? '';
        setName(currentName);

        if (!fileUrl) {
            setContent(<div>Файл не найден</div>);
            return;
        }

        fetch(fileUrl)
            .then((res) => res.arrayBuffer())
            .then(async (arrayBuffer) => {
                const extension = currentName.split('.').pop()?.toLowerCase();

                if (extension === 'docx') {
                    const result = await mammoth.convertToHtml({
                        arrayBuffer,
                    }, {
                        includeDefaultStyleMap: true,
                        styleMap: [
                            "p[style-name='Title'] => h1:fresh",
                            "p[style-name='Heading 1'] => h2:fresh",
                            "p[style-name='Heading 2'] => h3:fresh",
                            "p[style-name='Heading 3'] => h4:fresh",
                            "b => strong",
                            "i => em",
                        ],
                    });

                    setContent(
                        <div
                            className="docx-content"
                            dangerouslySetInnerHTML={{ __html: result.value }}
                        />
                    );
                    return;
                }

                if (extension === 'xlsx') {
                    const data = new Uint8Array(arrayBuffer);
                    const workbook = XLSX.read(data, { type: 'array' });
                    const sheetNames = workbook.SheetNames;

                    const sheetsView = sheetNames.map((sheetName) => {
                        const sheet = workbook.Sheets[sheetName];
                        const rows = XLSX.utils.sheet_to_json(sheet, {
                            header: 1,
                            defval: "",
                        }) as SheetRows;

                        return (
                            <div key={sheetName} style={{ marginBottom: 24 }}>
                                <h3 style={{ marginBottom: 8 }}>{sheetName}</h3>
                                <div style={{ overflowX: "auto", border: "1px solid #2d3748", borderRadius: 8 }}>
                                    <table cellPadding={8} style={{ borderCollapse: 'collapse', width: '100%' }}>
                                        <tbody>
                                            {rows.map((row, rowIndex) => (
                                                <tr key={rowIndex} style={{ background: rowIndex === 0 ? "#243041" : "transparent" }}>
                                                    {row.map((cell, cellIndex) => (
                                                        <td
                                                            key={cellIndex}
                                                            style={{
                                                                borderBottom: "1px solid #2d3748",
                                                                borderRight: "1px solid #2d3748",
                                                                minWidth: 90,
                                                                color: "#e2e8f0",
                                                                fontWeight: rowIndex === 0 ? 600 : 400,
                                                            }}
                                                        >
                                                            {String(cell ?? "")}
                                                        </td>
                                                    ))}
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        );
                    });

                    setContent(<div>{sheetsView}</div>);
                    return;
                }

                if (extension === 'pptx') {
                    const zip = await JSZip.loadAsync(arrayBuffer);
                    const slideNames = Object.keys(zip.files)
                        .filter((n) => /^ppt\/slides\/slide\d+\.xml$/i.test(n))
                        .sort((a, b) => {
                            const an = Number(a.match(/\d+/)?.[0] ?? 0);
                            const bn = Number(b.match(/\d+/)?.[0] ?? 0);
                            return an - bn;
                        });

                    const slides = await Promise.all(
                        slideNames.map(async (slideName, index) => {
                            const xmlText = await zip.file(slideName)?.async("text");
                            const texts = xmlText ? formatXmlSlideText(xmlText) : [];
                            return { index: index + 1, texts };
                        }),
                    );

                    setContent(
                        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                            {slides.length === 0 ? (
                                <div style={{ color: "#94a3b8" }}>Не удалось извлечь текст из слайдов.</div>
                            ) : (
                                slides.map((slide) => (
                                    <div key={slide.index} style={{ border: "1px solid #2d3748", borderRadius: 8, padding: 12, background: "#111827" }}>
                                        <div style={{ color: "#93c5fd", marginBottom: 8, fontWeight: 600 }}>Слайд {slide.index}</div>
                                        {slide.texts.length > 0 ? (
                                            <ul style={{ margin: 0, paddingLeft: 18 }}>
                                                {slide.texts.map((t, i) => (
                                                    <li key={i} style={{ color: "#e2e8f0", marginBottom: 4 }}>{t}</li>
                                                ))}
                                            </ul>
                                        ) : (
                                            <div style={{ color: "#94a3b8" }}>На слайде нет текстовых блоков.</div>
                                        )}
                                    </div>
                                ))
                            )}
                        </div>
                    );
                    return;
                }

                if (extension === 'json') {
                    const text = new TextDecoder('utf-8').decode(arrayBuffer);
                    try {
                        const parsed = JSON.parse(text);
                        setContent(
                            <pre style={{ whiteSpace: "pre-wrap", wordBreak: "break-word", background: "#111827", color: "#e2e8f0", borderRadius: 8, padding: 16, border: "1px solid #2d3748" }}>
                                {JSON.stringify(parsed, null, 2)}
                            </pre>
                        );
                    } catch {
                        setContent(
                            <pre style={{ whiteSpace: "pre-wrap", wordBreak: "break-word", background: "#111827", color: "#e2e8f0", borderRadius: 8, padding: 16, border: "1px solid #2d3748" }}>
                                {text}
                            </pre>
                        );
                    }
                    return;
                }

                if (extension === 'pdf') {
                    setContent(
                        <div style={{ width: '100%', height: 'calc(100vh - 120px)' }}>
                            <iframe src={fileUrl} style={{ width: '100%', height: '100%', border: 'none', borderRadius: 8 }} title={currentName} />
                        </div>
                    );
                    return;
                }

                if (extension === 'txt') {
                    const text = new TextDecoder('utf-8').decode(arrayBuffer);
                    setContent(
                        <pre style={{ whiteSpace: "pre-wrap", wordBreak: "break-word", background: "#111827", color: "#e2e8f0", borderRadius: 8, padding: 16, border: "1px solid #2d3748", fontFamily: "monospace", fontSize: 13, lineHeight: 1.7 }}>
                            {text}
                        </pre>
                    );
                    return;
                }

                if (extension === 'png' || extension === 'jpg' || extension === 'jpeg') {
                    setContent(
                        <div style={{ textAlign: 'center' }}>
                            <img src={fileUrl} alt={currentName} style={{ maxWidth: '100%', maxHeight: '80vh', borderRadius: 8, boxShadow: "0 8px 32px rgba(0,0,0,0.5)" }} />
                        </div>
                    );
                    return;
                }

                setContent(<div style={{ color: "#94a3b8", textAlign: "center", padding: 48 }}>Неподдерживаемый формат файла</div>);
            })
            .catch((err) => {
                console.error('Ошибка загрузки файла:', err);
                setContent(<div>Не удалось загрузить файл</div>);
            });
    }, []);

    return (
        <>
            <Header centralString={companyName} backHref="/projectFiles" />
            <div style={{ marginTop: "44px", padding: 20 }}>
                <h2 style={{ fontSize: '2rem', textAlign: 'center' }}>{name}</h2>
                {content}
            </div>
            <style jsx global>{`
        .docx-content {
          max-width: 980px;
          margin: 0 auto;
          padding: 16px 20px;
          line-height: 1.65;
          color: #e2e8f0;
          background: #111827;
          border: 1px solid #2d3748;
          border-radius: 10px;
          overflow-wrap: anywhere;
        }
        .docx-content h1, .docx-content h2, .docx-content h3, .docx-content h4 {
          margin-top: 1.1em;
          margin-bottom: 0.45em;
          color: #93c5fd;
          line-height: 1.35;
        }
        .docx-content p {
          margin: 0 0 0.8em;
          color: #e5e7eb;
        }
        .docx-content ul, .docx-content ol {
          margin: 0.4em 0 1em 1.4em;
        }
        .docx-content table {
          border-collapse: collapse;
          width: 100%;
          margin: 1em 0;
          border: 1px solid #374151;
        }
        .docx-content td, .docx-content th {
          border: 1px solid #374151;
          padding: 8px;
          vertical-align: top;
        }
        .docx-content img {
          max-width: 100%;
          height: auto;
          border-radius: 6px;
          margin: 8px 0;
        }
      `}</style>
        </>
    );
}