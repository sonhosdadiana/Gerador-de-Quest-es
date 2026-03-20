/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useRef, useEffect } from 'react';
import { GoogleGenAI, Type } from "@google/genai";
import { 
  BookOpen, 
  GraduationCap, 
  Hash, 
  Sparkles, 
  Copy, 
  Check, 
  Loader2,
  AlertCircle,
  FileText,
  ClipboardCheck,
  Upload,
  X,
  Image as ImageIcon,
  FileUp,
  Search,
  Info,
  ChevronRight,
  FileDown,
  FileText as FileWord,
  Maximize,
  Minimize,
  Heart,
  Trash2,
  Star
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { jsPDF } from "jspdf";
import { Document, Packer, Paragraph, TextRun, ImageRun, AlignmentType, Header, Footer } from "docx";
import { saveAs } from "file-saver";

// Initialize Gemini API
const genAI = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || '' });

const LOGO_URL = "https://lh3.googleusercontent.com/d/17Xf_gXOtRmitfh9QDBdKY7byDMe0Fyta";

interface Question {
  id: number;
  text: string;
  options: string[];
  correctAnswer: string;
  explanation: string;
  imagePrompt?: string;
  imageUrl?: string;
}

interface GenerationResult {
  questions: Question[];
}

interface BNCCSkill {
  code: string;
  description: string;
  objectOfKnowledge: string;
  learningObjectives: string;
}

export default function App() {
  const [showLanding, setShowLanding] = useState(true);
  const [year, setYear] = useState('9º Ano');
  const [adaptation, setAdaptation] = useState('standard');
  const [difficulty, setDifficulty] = useState('Médio');
  const [subject, setSubject] = useState('');
  const [quantity, setQuantity] = useState(5);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<GenerationResult | null>(null);
  const [logoError, setLogoError] = useState(false);
  const [isFullScreen, setIsFullScreen] = useState(false);
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [pdfBase64, setPdfBase64] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [downloading, setDownloading] = useState<'pdf' | 'word' | null>(null);
  const [activeTab, setActiveTab] = useState<'generator' | 'bncc' | 'favorites'>('generator');
  const [bnccQuery, setBnccQuery] = useState('');
  const [bnccResults, setBnccResults] = useState<BNCCSkill[]>([]);
  const [bnccLoading, setBnccLoading] = useState(false);
  const [favorites, setFavorites] = useState<Question[]>(() => {
    const saved = localStorage.getItem('professor_uebert_favorites');
    return saved ? JSON.parse(saved) : [];
  });
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    localStorage.setItem('professor_uebert_favorites', JSON.stringify(favorites));
  }, [favorites]);

  useEffect(() => {
    const handleFullScreenChange = () => {
      setIsFullScreen(!!document.fullscreenElement);
    };
    document.addEventListener('fullscreenchange', handleFullScreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullScreenChange);
  }, []);

  const toggleFullScreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch((err) => {
        console.error(`Error attempting to enable full-screen mode: ${err.message}`);
      });
    } else {
      if (document.exitFullscreen) {
        document.exitFullscreen();
      }
    }
  };

  const toggleFavorite = (question: Question) => {
    setFavorites(prev => {
      const isFav = prev.some(f => f.text === question.text);
      if (isFav) {
        return prev.filter(f => f.text !== question.text);
      } else {
        return [...prev, { ...question, id: Date.now() + Math.random() }];
      }
    });
  };

  const removeFavorite = (id: number) => {
    setFavorites(prev => prev.filter(f => f.id !== id));
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    const MAX_SIZE = 50 * 1024 * 1024; // 50MB limit for Gemini inline data

    if (file) {
      if (file.type !== 'application/pdf') {
        setError('Por favor, selecione apenas arquivos PDF.');
        return;
      }
      
      if (file.size > MAX_SIZE) {
        setError('O arquivo PDF é muito grande (máximo 50MB). Por favor, use um arquivo menor ou divida o seu PDF.');
        return;
      }

      setPdfFile(file);
      setError(null);
      const reader = new FileReader();
      reader.onload = () => {
        const base64 = (reader.result as string).split(',')[1];
        setPdfBase64(base64);
      };
      reader.readAsDataURL(file);
    }
  };

  const searchBNCC = async () => {
    if (!bnccQuery.trim()) return;
    
    setBnccLoading(true);
    setError(null);
    try {
      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });
      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: `Aja como uma enciclopédia oficial da BNCC (Base Nacional Comum Curricular) do Brasil.
        Pesquise por habilidades relacionadas a: "${bnccQuery}".
        Retorne uma lista de até 5 habilidades que correspondam ao código ou palavra-chave.
        Para cada habilidade, forneça: código, descrição completa, objeto de conhecimento e objetivos de aprendizagem.`,
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                code: { type: Type.STRING },
                description: { type: Type.STRING },
                objectOfKnowledge: { type: Type.STRING },
                learningObjectives: { type: Type.STRING }
              },
              required: ["code", "description", "objectOfKnowledge", "learningObjectives"]
            }
          }
        }
      });

      const data = JSON.parse(response.text || '[]');
      setBnccResults(data);
    } catch (err) {
      console.error(err);
      setError('Erro ao consultar a BNCC. Tente novamente.');
    } finally {
      setBnccLoading(false);
    }
  };

  const removePdf = () => {
    setPdfFile(null);
    setPdfBase64(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const generateQuestions = async () => {
    if (!subject.trim() && !pdfFile) {
      setError('Por favor, digite um assunto ou envie um PDF.');
      return;
    }

    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const model = "gemini-3.1-pro-preview";
      
      let contents: any = [];
      
      let adaptationInstructions = "";
      if (adaptation === 'autism') {
        adaptationInstructions = `
        ADAPTAÇÃO PARA AUTISMO (TEA):
        - Use linguagem clara, direta e literal. Evite metáforas ou enunciados ambíguos.
        - Foque em uma única tarefa por questão.
        - Use comandos curtos e objetivos.
        - Priorize o uso de imagens de apoio nítidas e funcionais.
        - Estruture a questão de forma previsível e organizada.`;
      } else if (adaptation === 'intellectual') {
        adaptationInstructions = `
        ADAPTAÇÃO PARA DEFICIÊNCIA INTELECTUAL:
        - Simplifique o vocabulário e a complexidade dos cálculos.
        - Use exemplos extremamente concretos e do cotidiano do aluno.
        - Reduza a carga de processamento de informações (menos dados irrelevantes).
        - Aumente o suporte visual.
        - Foque em conceitos fundamentais em vez de abstrações complexas.`;
      } else if (adaptation === 'adhd') {
        adaptationInstructions = `
        ADAPTAÇÃO PARA TDAH:
        - Enunciados curtos e concisos.
        - Destaque palavras-chave ou dados importantes (use negrito se necessário).
        - Divida problemas complexos em etapas menores.
        - Evite distrações visuais desnecessárias no texto.`;
      }

      const systemPrompt = `Você é um professor de matemática especialista em educação inclusiva e BNCC.
      Gere ${quantity} questões de múltipla escolha sobre "${subject || 'o conteúdo do PDF'}" para o "${year}".
      Nível de dificuldade: ${difficulty}.
      
      ${adaptation !== 'standard' ? `ESTRATÉGIA DE ADAPTAÇÃO: ${adaptationInstructions}` : 'Siga o padrão regular da BNCC para o ano solicitado.'}

      Regras Gerais:
      1. Cada questão deve ter 5 alternativas (A, B, C, D, E).
      2. Apenas uma alternativa deve ser correta.
      3. As questões devem ser contextualizadas e adequadas ao nível cognitivo do ano solicitado.
      4. Se a questão precisar de um apoio visual (gráfico, triângulo, função, etc.), descreva detalhadamente essa imagem no campo "imagePrompt". Se não precisar, deixe vazio.
      5. Forneça uma explicação pedagógica para a resposta correta.
      6. O idioma deve ser Português do Brasil.
      ${pdfFile ? 'IMPORTANTE: Use o conteúdo do PDF fornecido como base principal para as questões.' : ''}`;

      if (pdfBase64) {
        contents = {
          parts: [
            { inlineData: { data: pdfBase64, mimeType: 'application/pdf' } },
            { text: systemPrompt }
          ]
        };
      } else {
        contents = systemPrompt;
      }

      const response = await genAI.models.generateContent({
        model: model,
        contents: contents,
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              questions: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    id: { type: Type.INTEGER },
                    text: { type: Type.STRING },
                    options: { 
                      type: Type.ARRAY, 
                      items: { type: Type.STRING },
                      description: "Lista de 5 alternativas"
                    },
                    correctAnswer: { type: Type.STRING, description: "A letra da alternativa correta (A, B, C, D ou E)" },
                    explanation: { type: Type.STRING },
                    imagePrompt: { type: Type.STRING, description: "Descrição detalhada para gerar uma imagem de apoio visual, se necessário." }
                  },
                  required: ["id", "text", "options", "correctAnswer", "explanation"]
                }
              }
            },
            required: ["questions"]
          }
        }
      });

      const text = response.text;
      if (text) {
        const parsed = JSON.parse(text) as GenerationResult;
        
        // Generate images for questions that have an imagePrompt
        const questionsWithImages = await Promise.all(parsed.questions.map(async (q) => {
          if (q.imagePrompt && q.imagePrompt.trim().length > 10) {
            try {
              const imgResponse = await genAI.models.generateContent({
                model: 'gemini-2.5-flash-image',
                contents: {
                  parts: [{ text: `Crie uma ilustração matemática didática, limpa e profissional para uma questão de prova escolar. Descrição: ${q.imagePrompt}. Estilo: Diagrama técnico, fundo branco, linhas pretas nítidas.` }]
                },
                config: {
                  imageConfig: { aspectRatio: "1:1" }
                }
              });
              
              const imagePart = imgResponse.candidates?.[0]?.content?.parts.find(p => p.inlineData);
              if (imagePart?.inlineData) {
                return { ...q, imageUrl: `data:image/png;base64,${imagePart.inlineData.data}` };
              }
            } catch (imgErr) {
              console.error("Erro ao gerar imagem para questão", q.id, imgErr);
            }
          }
          return q;
        }));

        setResult({ questions: questionsWithImages });
      } else {
        throw new Error("Não foi possível gerar as questões.");
      }
    } catch (err: any) {
      console.error(err);
      setError(err.message || 'Ocorreu um erro ao gerar as questões. Tente novamente.');
    } finally {
      setLoading(false);
    }
  };

  const downloadPDF = async () => {
    if (!result) return;
    setDownloading('pdf');
    
    try {
      const doc = new jsPDF();
      const margin = 20;
      let y = 20;

      // Header
      try {
        const img = new Image();
        img.src = LOGO_URL;
        await new Promise((resolve, reject) => {
          img.onload = resolve;
          img.onerror = reject;
        });
        doc.addImage(img, 'PNG', margin, y, 15, 15);
      } catch (e) {
        console.warn("Could not load logo for PDF", e);
      }
      
      doc.setFont("helvetica", "bold");
      doc.setFontSize(16);
      doc.text("Professor Uebert", margin + 20, y + 10);
      
      y += 25;
      doc.setDrawColor(200, 200, 200);
      doc.line(margin, y, 190, y);
      y += 15;

      // Content
      doc.setFontSize(12);
      doc.setFont("helvetica", "normal");
      
      for (let i = 0; i < result.questions.length; i++) {
        const q = result.questions[i];
        
        // Check page break
        if (y > 250) {
          doc.addPage();
          y = 20;
        }

        doc.setFont("helvetica", "bold");
        doc.text(`Questão ${i + 1}:`, margin, y);
        y += 7;
        
        doc.setFont("helvetica", "normal");
        const splitText = doc.splitTextToSize(q.text, 170);
        doc.text(splitText, margin, y);
        y += (splitText.length * 7) + 5;

        q.options.forEach((opt, idx) => {
          const label = String.fromCharCode(65 + idx) + ") ";
          doc.text(label + opt, margin + 5, y);
          y += 7;
        });
        
        y += 3;
        doc.setFont("helvetica", "italic");
        doc.setFontSize(10);
        doc.setTextColor(100, 100, 100);
        const splitExpl = doc.splitTextToSize(`Explicação: ${q.explanation}`, 160);
        doc.text(splitExpl, margin + 10, y);
        y += (splitExpl.length * 5) + 12;
        doc.setTextColor(0, 0, 0);
        doc.setFontSize(12);
      }

      // Answer Key (Gabarito)
      doc.addPage();
      y = 20;
      doc.setFont("helvetica", "bold");
      doc.setFontSize(16);
      doc.text("Gabarito Comentado", margin, y);
      y += 15;

      doc.setFontSize(11);
      for (let i = 0; i < result.questions.length; i++) {
        const q = result.questions[i];
        
        if (y > 250) {
          doc.addPage();
          y = 20;
        }

        doc.setFont("helvetica", "bold");
        doc.text(`Questão ${i + 1}: Alternativa ${q.correctAnswer}`, margin, y);
        y += 7;

        doc.setFont("helvetica", "normal");
        doc.setFontSize(10);
        const splitExpl = doc.splitTextToSize(`Explicação: ${q.explanation}`, 170);
        doc.text(splitExpl, margin + 5, y);
        y += (splitExpl.length * 6) + 10;
        doc.setFontSize(11);
      }

      // Footer
      const footerText = "Este aplicativo tem te ajudado? Que tal uma pequena contribuição para ajudar nas minhas pesquisas e desenvolvimento? Chave pix: uebertsociais@gmail.com";
      doc.setFontSize(8);
      doc.setTextColor(150, 150, 150);
      const splitFooter = doc.splitTextToSize(footerText, 170);
      doc.text(splitFooter, margin, 280);

      doc.save(`atividades_matematica_${subject.replace(/\s+/g, '_')}.pdf`);
    } catch (err) {
      console.error(err);
      setError("Erro ao gerar PDF.");
    } finally {
      setDownloading(null);
    }
  };

  const downloadWord = async () => {
    if (!result) return;
    setDownloading('word');

    try {
      const logoResponse = await fetch(LOGO_URL);
      const logoBlob = await logoResponse.blob();
      const logoArrayBuffer = await logoBlob.arrayBuffer();

      const doc = new Document({
        sections: [{
          headers: {
            default: new Header({
              children: [
                new Paragraph({
                  children: [
                    new ImageRun({
                      data: logoArrayBuffer,
                      transformation: { width: 40, height: 40 },
                      type: "png",
                    } as any),
                    new TextRun({
                      text: " Professor Uebert",
                      bold: true,
                      size: 32,
                    }),
                  ],
                }),
              ],
            }),
          },
          footers: {
            default: new Footer({
              children: [
                new Paragraph({
                  alignment: AlignmentType.CENTER,
                  children: [
                    new TextRun({
                      text: "Este aplicativo tem te ajudado? Que tal uma pequena contribuição para ajudar nas minhas pesquisas e desenvolvimento? Chave pix: uebertsociais@gmail.com",
                      size: 16,
                      color: "999999",
                    }),
                  ],
                }),
              ],
            }),
          },
          children: [
            new Paragraph({
              text: `Atividade de Matemática - ${year}`,
              heading: "Heading1",
              alignment: AlignmentType.CENTER,
            }),
            new Paragraph({ text: "" }),
            ...result.questions.flatMap((q, i) => [
              new Paragraph({
                children: [
                  new TextRun({ text: `Questão ${i + 1}:`, bold: true, size: 24 }),
                ],
                spacing: { before: 400 },
              }),
              new Paragraph({
                children: [
                  new TextRun({ text: q.text, size: 24 }),
                ],
                spacing: { after: 200 },
              }),
              ...q.options.map((opt, idx) => 
                new Paragraph({
                  children: [
                    new TextRun({ text: `${String.fromCharCode(65 + idx)}) ${opt}`, size: 24 }),
                  ],
                  indent: { left: 720 },
                })
              ),
              new Paragraph({
                children: [
                  new TextRun({ text: `Explicação: ${q.explanation}`, size: 20, italics: true, color: "666666" }),
                ],
                spacing: { before: 200, after: 400 },
                indent: { left: 720 },
              }),
            ]),
            new Paragraph({ text: "", spacing: { before: 400 } }),
            new Paragraph({
              children: [
                new TextRun({ text: "Gabarito Comentado", bold: true, size: 32, underline: {} }),
              ],
              alignment: AlignmentType.CENTER,
              spacing: { before: 400, after: 400 },
            }),
            ...result.questions.flatMap((q, i) => [
              new Paragraph({
                children: [
                  new TextRun({ text: `Questão ${i + 1}: Alternativa ${q.correctAnswer}`, bold: true, size: 24 }),
                ],
                spacing: { before: 200 },
              }),
              new Paragraph({
                children: [
                  new TextRun({ text: `Explicação: ${q.explanation}`, size: 20, italics: true }),
                ],
                spacing: { after: 200 },
                indent: { left: 360 },
              }),
            ]),
          ],
        }],
      });

      const blob = await Packer.toBlob(doc);
      saveAs(blob, `atividades_matematica_${subject.replace(/\s+/g, '_')}.docx`);
    } catch (err) {
      console.error(err);
      setError("Erro ao gerar arquivo Word.");
    } finally {
      setDownloading(null);
    }
  };

  const copyToClipboard = () => {
    if (!result) return;

    const questionsText = result.questions.map((q, i) => {
      const optionsText = q.options.map((opt, idx) => `${String.fromCharCode(65 + idx)}) ${opt}`).join('\n');
      return `Questão ${i + 1}:\n${q.text}\n\n${optionsText}\n`;
    }).join('\n---\n\n');

    navigator.clipboard.writeText(questionsText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (showLanding) {
    return (
      <div className="min-h-screen bg-[#F8FAFC] flex flex-col items-center justify-center p-4 font-sans overflow-hidden relative">
        {/* Full Screen Button for Landing */}
        <button 
          onClick={toggleFullScreen}
          className="absolute top-6 right-6 p-3 bg-white/80 backdrop-blur-sm hover:bg-white rounded-2xl transition-all text-slate-500 shadow-lg border border-white z-20"
          title={isFullScreen ? "Sair da Tela Cheia" : "Tela Cheia"}
        >
          {isFullScreen ? <Minimize className="w-6 h-6" /> : <Maximize className="w-6 h-6" />}
        </button>

        {/* Background Decorative Elements */}
        <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-brand/10 rounded-full blur-[120px] opacity-50" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-emerald-100 rounded-full blur-[120px] opacity-50" />

        <motion.div 
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.5 }}
          className="max-w-2xl w-full bg-white/80 backdrop-blur-xl p-12 rounded-[40px] border border-white shadow-2xl shadow-brand/10 text-center space-y-8 relative z-10"
        >
          <div className="inline-flex p-1 bg-white rounded-3xl shadow-2xl shadow-brand/20 mb-4 overflow-hidden border border-slate-100 min-w-[96px] min-h-[96px] items-center justify-center">
            {!logoError ? (
              <img 
                src={LOGO_URL} 
                alt="Logo Professor Uebert" 
                className="w-24 h-24 object-contain drop-shadow-xl"
                referrerPolicy="no-referrer"
                onError={() => setLogoError(true)}
              />
            ) : (
              <div className="w-24 h-24 flex items-center justify-center bg-brand/5 rounded-2xl">
                <Sparkles className="w-12 h-12 text-brand" />
              </div>
            )}
          </div>
          
          <div className="space-y-4">
            <h1 className="font-display font-black text-4xl md:text-5xl text-slate-900 tracking-tight leading-tight">
              Professor Uebert <br />
              <span className="text-brand">Gerador de Questões</span>
            </h1>
            <p className="text-slate-500 text-lg max-w-md mx-auto leading-relaxed">
              Crie exercícios de matemática personalizados e alinhados à BNCC em segundos com o poder da Inteligência Artificial.
            </p>
          </div>

          <motion.button 
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={() => setShowLanding(false)}
            className="bg-brand hover:bg-brand-hover text-white font-bold text-xl px-10 py-5 rounded-2xl transition-all shadow-xl shadow-brand/20 flex items-center gap-3 mx-auto group"
          >
            Vamos começar?
            <BookOpen className="w-6 h-6 group-hover:translate-x-1 transition-transform" />
          </motion.button>

          <div className="pt-8 flex items-center justify-center gap-6 text-slate-400 text-sm font-medium">
            <span className="flex items-center gap-1.5"><Check className="w-4 h-4 text-emerald-500" /> BNCC</span>
            <span className="flex items-center gap-1.5"><Check className="w-4 h-4 text-emerald-500" /> Ensino Fundamental</span>
            <span className="flex items-center gap-1.5"><Check className="w-4 h-4 text-emerald-500" /> Ensino Médio</span>
          </div>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F8FAFC] text-slate-900 font-sans selection:bg-brand/10">
      {/* Header */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-4 h-16 flex items-center justify-between">
          <button 
            onClick={() => setShowLanding(true)}
            className="flex items-center gap-3 hover:opacity-80 transition-opacity"
          >
            <div className="bg-white p-1 rounded-lg border border-slate-100 shadow-sm min-w-[40px] min-h-[40px] flex items-center justify-center">
              {!logoError ? (
                <img 
                  src={LOGO_URL} 
                  alt="Logo" 
                  className="w-8 h-8 object-contain drop-shadow-md"
                  referrerPolicy="no-referrer"
                  onError={() => setLogoError(true)}
                />
              ) : (
                <Sparkles className="w-5 h-5 text-brand" />
              )}
            </div>
            <h1 className="font-display font-bold text-xl tracking-tight text-slate-800">
              Professor Uebert
            </h1>
          </button>
          <div className="flex items-center gap-2">
            <div className="hidden sm:flex items-center gap-4 text-sm font-medium text-slate-500">
              <button 
                onClick={() => setActiveTab('generator')}
                className={`px-3 py-1.5 rounded-lg transition-all ${activeTab === 'generator' ? 'bg-brand/10 text-brand' : 'hover:bg-slate-100'}`}
              >
                Gerador
              </button>
              <button 
                onClick={() => setActiveTab('bncc')}
                className={`px-3 py-1.5 rounded-lg transition-all ${activeTab === 'bncc' ? 'bg-brand/10 text-brand' : 'hover:bg-slate-100'}`}
              >
                Consulta BNCC
              </button>
              <button 
                onClick={() => setActiveTab('favorites')}
                className={`px-3 py-1.5 rounded-lg transition-all flex items-center gap-2 ${activeTab === 'favorites' ? 'bg-brand/10 text-brand' : 'hover:bg-slate-100'}`}
              >
                <Heart className={`w-4 h-4 ${favorites.length > 0 ? 'fill-brand text-brand' : ''}`} />
                Favoritos
                {favorites.length > 0 && (
                  <span className="bg-brand text-white text-[10px] px-1.5 py-0.5 rounded-full">
                    {favorites.length}
                  </span>
                )}
              </button>
            </div>
            <button 
              onClick={toggleFullScreen}
              className="p-2 hover:bg-slate-100 rounded-lg transition-all text-slate-500"
              title={isFullScreen ? "Sair da Tela Cheia" : "Tela Cheia"}
            >
              {isFullScreen ? <Minimize className="w-5 h-5" /> : <Maximize className="w-5 h-5" />}
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-8 md:py-12">
        {activeTab === 'generator' ? (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
            {/* Sidebar / Form */}
            <div className="lg:col-span-4 space-y-6">
            <section className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
              <h2 className="font-display font-semibold text-lg mb-6 flex items-center gap-2">
                <FileText className="w-5 h-5 text-brand" />
                Configurações
              </h2>
              
              <div className="space-y-5">
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-1.5 flex items-center gap-2">
                    <GraduationCap className="w-4 h-4 text-slate-400" />
                    Ano de Escolaridade
                  </label>
                  <select 
                    value={year}
                    onChange={(e) => setYear(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:ring-2 focus:ring-brand focus:border-brand transition-all outline-none"
                  >
                    <optgroup label="Ensino Fundamental">
                      <option>1º Ano</option>
                      <option>2º Ano</option>
                      <option>3º Ano</option>
                      <option>4º Ano</option>
                      <option>5º Ano</option>
                      <option>6º Ano</option>
                      <option>7º Ano</option>
                      <option>8º Ano</option>
                      <option>9º Ano</option>
                    </optgroup>
                    <optgroup label="Ensino Médio">
                      <option>1ª Série</option>
                      <option>2ª Série</option>
                      <option>3ª Série</option>
                    </optgroup>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-1.5 flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-slate-400" />
                    Adaptação Pedagógica
                  </label>
                  <select 
                    value={adaptation}
                    onChange={(e) => setAdaptation(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:ring-2 focus:ring-brand focus:border-brand transition-all outline-none appearance-none"
                  >
                    <option value="standard">Padrão (BNCC Regular)</option>
                    <option value="autism">Autismo (Linguagem Literal e Visual)</option>
                    <option value="intellectual">Deficiência Intelectual (Concreto e Simplificado)</option>
                    <option value="adhd">TDAH (Foco e Concisão)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-1.5 flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 text-slate-400" />
                    Nível de Dificuldade
                  </label>
                  <div className="grid grid-cols-3 gap-2">
                    {['Fácil', 'Médio', 'Difícil'].map((level) => (
                      <button
                        key={level}
                        onClick={() => setDifficulty(level)}
                        className={`py-2 text-xs font-bold rounded-xl border transition-all ${
                          difficulty === level
                            ? 'bg-brand border-brand text-white shadow-md shadow-brand/20'
                            : 'bg-slate-50 border-slate-200 text-slate-500 hover:bg-slate-100'
                        }`}
                      >
                        {level}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-1.5 flex items-center gap-2">
                    <FileUp className="w-4 h-4 text-slate-400" />
                    Basear em PDF (Opcional)
                  </label>
                  {!pdfFile ? (
                    <div 
                      onClick={() => fileInputRef.current?.click()}
                      className="border-2 border-dashed border-slate-200 rounded-xl p-4 text-center hover:border-brand hover:bg-brand/5 transition-all cursor-pointer group"
                    >
                      <Upload className="w-6 h-6 text-slate-300 mx-auto mb-2 group-hover:text-brand transition-colors" />
                      <p className="text-xs text-slate-500">Clique para enviar um livro ou material em PDF</p>
                      <p className="text-[10px] text-slate-400 mt-1">(Limite: 50MB)</p>
                      <input 
                        type="file" 
                        ref={fileInputRef}
                        onChange={handleFileChange}
                        accept=".pdf"
                        className="hidden"
                      />
                    </div>
                  ) : (
                    <div className="bg-brand/5 border border-brand/20 rounded-xl p-3 flex items-center justify-between">
                      <div className="flex items-center gap-2 overflow-hidden">
                        <FileText className="w-4 h-4 text-brand shrink-0" />
                        <span className="text-xs font-medium text-brand truncate">{pdfFile.name}</span>
                      </div>
                      <button 
                        onClick={removePdf}
                        className="p-1 hover:bg-brand/10 rounded-full text-brand transition-colors"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  )}
                </div>

                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-1.5 flex items-center gap-2">
                    <BookOpen className="w-4 h-4 text-slate-400" />
                    Assunto
                  </label>
                  <input 
                    type="text"
                    value={subject}
                    onChange={(e) => setSubject(e.target.value)}
                    placeholder="Ex: Equações do 2º grau"
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:ring-2 focus:ring-brand focus:border-brand transition-all outline-none"
                  />
                </div>

                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-1.5 flex items-center gap-2">
                    <Hash className="w-4 h-4 text-slate-400" />
                    Quantidade de Questões
                  </label>
                  <div className="flex items-center gap-4">
                    <input 
                      type="range"
                      min="1"
                      max="10"
                      value={quantity}
                      onChange={(e) => setQuantity(parseInt(e.target.value))}
                      className="flex-1 accent-brand"
                    />
                    <span className="text-sm font-bold text-brand bg-brand/10 px-3 py-1 rounded-full w-10 text-center">
                      {quantity}
                    </span>
                  </div>
                </div>

                <button 
                  onClick={generateQuestions}
                  disabled={loading}
                  className="w-full bg-brand hover:bg-brand-hover disabled:bg-brand/50 text-white font-semibold py-3 rounded-xl transition-all shadow-lg shadow-brand/20 flex items-center justify-center gap-2 group active:scale-[0.98]"
                >
                  {loading ? (
                    <>
                      <Loader2 className="w-5 h-5 animate-spin" />
                      Gerando...
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-5 h-5 group-hover:rotate-12 transition-transform" />
                      Gerar Questões
                    </>
                  )}
                </button>
              </div>
            </section>

            {error && (
              <motion.div 
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="bg-red-50 border border-red-100 p-4 rounded-xl flex gap-3 text-red-700 text-sm"
              >
                <AlertCircle className="w-5 h-5 shrink-0" />
                <p>{error}</p>
              </motion.div>
            )}
          </div>

          {/* Results Area */}
          <div className="lg:col-span-8">
            <AnimatePresence mode="wait">
              {!result && !loading && (
                <motion.div 
                  key="empty"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="bg-white border-2 border-dashed border-slate-200 rounded-3xl p-12 flex flex-col items-center justify-center text-center space-y-4"
                >
                  <div className="bg-slate-50 p-6 rounded-full">
                    <BookOpen className="w-12 h-12 text-slate-300" />
                  </div>
                  <div>
                    <h3 className="font-display font-bold text-xl text-slate-800">Pronto para começar?</h3>
                    <p className="text-slate-500 max-w-xs mx-auto mt-2">
                      Preencha os campos ao lado e clique em gerar para criar sua lista de exercícios personalizada.
                    </p>
                  </div>
                </motion.div>
              )}

              {loading && (
                <motion.div 
                  key="loading"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="bg-white rounded-3xl p-12 flex flex-col items-center justify-center text-center space-y-6"
                >
                  <div className="relative">
                    <div className="w-20 h-20 border-4 border-indigo-100 border-t-indigo-600 rounded-full animate-spin"></div>
                    <Sparkles className="w-8 h-8 text-indigo-600 absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2" />
                  </div>
                  <div>
                    <h3 className="font-display font-bold text-xl text-slate-800">Criando questões incríveis...</h3>
                    <p className="text-slate-500 mt-2">O Gemini está elaborando exercícios alinhados à BNCC para você.</p>
                  </div>
                </motion.div>
              )}

              {result && (
                <motion.div 
                  key="result"
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="space-y-8"
                >
                  <div className="flex items-center justify-between bg-white p-4 rounded-2xl border border-slate-200 shadow-sm sticky top-20 z-[5]">
                    <div className="flex items-center gap-3">
                      <div className="bg-emerald-100 p-2 rounded-lg">
                        <ClipboardCheck className="w-5 h-5 text-emerald-600" />
                      </div>
                      <div>
                        <h3 className="font-bold text-slate-800 leading-tight">Questões Geradas</h3>
                        <p className="text-xs text-slate-500">{result.questions.length} exercícios prontos</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <button 
                        onClick={downloadPDF}
                        disabled={downloading !== null}
                        className="flex items-center gap-2 px-4 py-2 rounded-xl font-semibold text-sm bg-slate-100 hover:bg-slate-200 text-slate-700 transition-all disabled:opacity-50"
                      >
                        {downloading === 'pdf' ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileDown className="w-4 h-4" />}
                        PDF
                      </button>
                      <button 
                        onClick={downloadWord}
                        disabled={downloading !== null}
                        className="flex items-center gap-2 px-4 py-2 rounded-xl font-semibold text-sm bg-slate-100 hover:bg-slate-200 text-slate-700 transition-all disabled:opacity-50"
                      >
                        {downloading === 'word' ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileWord className="w-4 h-4" />}
                        Word
                      </button>
                    </div>
                  </div>

                  {/* AI Disclaimer Banner */}
                  <motion.div 
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="bg-amber-50 border border-amber-200 rounded-2xl p-4 flex items-start gap-3 shadow-sm"
                  >
                    <AlertCircle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                    <div className="space-y-1">
                      <p className="text-sm font-bold text-amber-900 leading-none">Aviso Importante para o Professor</p>
                      <p className="text-xs text-amber-700 leading-relaxed">
                        Esta ferramenta utiliza Inteligência Artificial para auxiliar na criação de conteúdo. 
                        Embora poderosa, a IA pode cometer erros em cálculos, interpretações ou na geração de imagens. 
                        <strong> Por favor, revise cuidadosamente todas as questões, gabaritos e resoluções antes de aplicá-las aos seus alunos.</strong>
                      </p>
                    </div>
                  </motion.div>

                  <div className="space-y-6">
                    {result.questions.map((q, i) => (
                      <div key={q.id} className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm hover:shadow-md transition-shadow">
                        <div className="bg-slate-50 px-6 py-3 border-b border-slate-100 flex items-center justify-between">
                          <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Questão {i + 1}</span>
                          <button 
                            onClick={() => toggleFavorite(q)}
                            className={`p-2 rounded-xl transition-all flex items-center gap-2 text-xs font-bold ${
                              favorites.some(f => f.text === q.text)
                                ? 'bg-brand/10 text-brand'
                                : 'bg-slate-100 text-slate-400 hover:bg-slate-200 hover:text-slate-600'
                            }`}
                          >
                            <Heart className={`w-4 h-4 ${favorites.some(f => f.text === q.text) ? 'fill-brand' : ''}`} />
                            {favorites.some(f => f.text === q.text) ? 'Favoritada' : 'Favoritar'}
                          </button>
                        </div>
                        <div className="p-6 space-y-6">
                          <p className="text-slate-800 leading-relaxed whitespace-pre-wrap font-medium text-lg">
                            {q.text}
                          </p>

                          {q.imageUrl && (
                            <div className="bg-white border border-slate-100 rounded-2xl p-4 shadow-inner flex flex-col items-center gap-2">
                              <img 
                                src={q.imageUrl} 
                                alt="Apoio visual da questão" 
                                className="max-w-full h-auto rounded-lg"
                                referrerPolicy="no-referrer"
                              />
                              <span className="text-[10px] text-slate-400 uppercase tracking-widest flex items-center gap-1">
                                <ImageIcon className="w-3 h-3" /> Imagem gerada por IA
                              </span>
                            </div>
                          )}
                          
                          <div className="grid grid-cols-1 gap-3">
                            {q.options.map((opt, idx) => (
                              <div 
                                key={idx}
                                className="flex items-start gap-3 p-4 rounded-xl bg-slate-50 border border-slate-100 hover:border-brand/20 hover:bg-brand/5 transition-colors group"
                              >
                                <span className="flex items-center justify-center w-7 h-7 rounded-lg bg-white border border-slate-200 text-xs font-bold text-slate-500 group-hover:border-brand/30 group-hover:text-brand transition-colors shrink-0">
                                  {String.fromCharCode(65 + idx)}
                                </span>
                                <span className="text-slate-700 pt-0.5">{opt}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Answer Key Section */}
                  <div className="bg-slate-900 rounded-3xl p-8 text-white space-y-8">
                    <div className="flex items-center gap-3 border-b border-white/10 pb-6">
                      <div className="bg-brand p-2 rounded-lg">
                        <Check className="w-5 h-5 text-white" />
                      </div>
                      <h3 className="font-display font-bold text-2xl">Gabarito e Resoluções</h3>
                    </div>

                    <div className="grid grid-cols-1 gap-8">
                      {result.questions.map((q, i) => (
                        <div key={q.id} className="space-y-3">
                          <div className="flex items-center gap-3">
                            <span className="text-brand font-bold">Q{i + 1}</span>
                            <span className="bg-brand/20 text-brand px-3 py-1 rounded-full text-xs font-bold uppercase tracking-widest border border-brand/30">
                              Resposta: {q.correctAnswer}
                            </span>
                          </div>
                          <div className="bg-white/5 border border-white/10 p-4 rounded-2xl">
                            <p className="text-slate-300 text-sm leading-relaxed italic">
                              {q.explanation}
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      ) : (
        <div className="space-y-8">
          <div className="bg-white p-8 rounded-3xl border border-slate-200 shadow-sm text-center max-w-3xl mx-auto">
            <div className="bg-brand/10 w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-6">
              <Search className="w-8 h-8 text-brand" />
            </div>
            <h2 className="font-display font-bold text-2xl text-slate-800 mb-2">Consulta de Habilidades BNCC</h2>
            <p className="text-slate-500 mb-8">Pesquise por código (ex: EF06MA01) ou palavras-chave para encontrar detalhes pedagógicos.</p>
            
            <div className="flex gap-2 max-w-xl mx-auto">
              <div className="relative flex-1">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                <input 
                  type="text"
                  value={bnccQuery}
                  onChange={(e) => setBnccQuery(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && searchBNCC()}
                  placeholder="Digite o código ou assunto..."
                  className="w-full pl-12 pr-4 py-3.5 bg-slate-50 border border-slate-200 rounded-2xl focus:ring-2 focus:ring-brand focus:border-brand outline-none transition-all"
                />
              </div>
              <button 
                onClick={searchBNCC}
                disabled={bnccLoading}
                className="bg-brand hover:bg-brand-hover disabled:bg-brand/50 text-white px-8 rounded-2xl font-bold transition-all flex items-center gap-2"
              >
                {bnccLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Pesquisar'}
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-6">
            <AnimatePresence mode="wait">
              {bnccLoading ? (
                <motion.div 
                  key="loading-bncc"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="py-20 text-center"
                >
                  <Loader2 className="w-12 h-12 text-brand animate-spin mx-auto mb-4" />
                  <p className="text-slate-500 font-medium">Consultando base de dados da BNCC...</p>
                </motion.div>
              ) : bnccResults.length > 0 ? (
                bnccResults.map((skill, idx) => (
                  <motion.div
                    key={skill.code}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: idx * 0.1 }}
                    className="bg-white rounded-3xl border border-slate-200 overflow-hidden shadow-sm hover:shadow-md transition-all group"
                  >
                    <div className="bg-slate-50 px-8 py-4 border-b border-slate-100 flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <span className="bg-brand text-white text-xs font-black px-3 py-1 rounded-full tracking-wider">
                          {skill.code}
                        </span>
                        <h4 className="font-bold text-slate-700">Habilidade BNCC</h4>
                      </div>
                      <button 
                        onClick={() => {
                          navigator.clipboard.writeText(`${skill.code}: ${skill.description}`);
                          alert('Código e descrição copiados!');
                        }}
                        className="text-slate-400 hover:text-brand transition-colors p-2"
                        title="Copiar Habilidade"
                      >
                        <Copy className="w-4 h-4" />
                      </button>
                    </div>
                    <div className="p-8 grid grid-cols-1 md:grid-cols-2 gap-8">
                      <div className="space-y-6">
                        <div>
                          <div className="flex items-center gap-2 text-brand mb-2">
                            <Info className="w-4 h-4" />
                            <span className="text-[10px] font-black uppercase tracking-widest">Descrição</span>
                          </div>
                          <p className="text-slate-700 leading-relaxed font-medium">
                            {skill.description}
                          </p>
                        </div>
                        <div>
                          <div className="flex items-center gap-2 text-brand mb-2">
                            <BookOpen className="w-4 h-4" />
                            <span className="text-[10px] font-black uppercase tracking-widest">Objeto de Conhecimento</span>
                          </div>
                          <p className="text-slate-600 text-sm italic">
                            {skill.objectOfKnowledge}
                          </p>
                        </div>
                      </div>
                      <div className="bg-slate-50 rounded-2xl p-6 border border-slate-100">
                        <div className="flex items-center gap-2 text-slate-400 mb-4">
                          <ChevronRight className="w-4 h-4" />
                          <span className="text-[10px] font-black uppercase tracking-widest">Objetivos de Aprendizagem</span>
                        </div>
                        <div className="text-slate-600 text-sm leading-relaxed whitespace-pre-wrap">
                          {skill.learningObjectives}
                        </div>
                      </div>
                    </div>
                  </motion.div>
                ))
              ) : bnccQuery && !bnccLoading && (
                <motion.div 
                  key="empty-bncc"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="py-20 text-center bg-white rounded-3xl border-2 border-dashed border-slate-200"
                >
                  <p className="text-slate-400">Nenhum resultado encontrado para "{bnccQuery}".</p>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      )}
        {activeTab === 'favorites' && (
          <div className="space-y-12">
            <div className="text-center space-y-4">
              <div className="bg-brand/10 w-20 h-20 rounded-full flex items-center justify-center mx-auto">
                <Heart className="w-10 h-10 text-brand fill-brand" />
              </div>
              <h2 className="font-display font-black text-4xl text-slate-800 tracking-tight">Suas Questões Favoritas</h2>
              <p className="text-slate-500 max-w-lg mx-auto leading-relaxed">
                Aqui você encontra todas as questões que salvou para usar em suas provas e atividades futuras.
              </p>
            </div>

            <div className="grid grid-cols-1 gap-8">
              <AnimatePresence mode="popLayout">
                {favorites.length > 0 ? (
                  favorites.map((q, i) => (
                    <motion.div
                      key={q.id}
                      layout
                      initial={{ opacity: 0, scale: 0.9 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.9 }}
                      className="bg-white rounded-3xl border border-slate-200 overflow-hidden shadow-sm hover:shadow-md transition-all group"
                    >
                      <div className="bg-slate-50 px-8 py-4 border-b border-slate-100 flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <Star className="w-5 h-5 text-amber-400 fill-amber-400" />
                          <h4 className="font-bold text-slate-700">Questão Salva #{i + 1}</h4>
                        </div>
                        <div className="flex items-center gap-2">
                          <button 
                            onClick={() => {
                              const text = `Questão:\n${q.text}\n\nAlternativas:\n${q.options.map((opt, idx) => `${String.fromCharCode(65 + idx)}) ${opt}`).join('\n')}\n\nGabarito: ${q.correctAnswer}\nExplicação: ${q.explanation}`;
                              navigator.clipboard.writeText(text);
                              alert('Questão copiada para a área de transferência!');
                            }}
                            className="text-slate-400 hover:text-brand transition-colors p-2"
                            title="Copiar Questão"
                          >
                            <Copy className="w-4 h-4" />
                          </button>
                          <button 
                            onClick={() => removeFavorite(q.id)}
                            className="text-slate-400 hover:text-red-500 transition-colors p-2"
                            title="Remover dos Favoritos"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                      <div className="p-8 space-y-8">
                        <p className="text-slate-800 leading-relaxed whitespace-pre-wrap font-medium text-lg">
                          {q.text}
                        </p>

                        {q.imageUrl && (
                          <div className="bg-white border border-slate-100 rounded-2xl p-4 shadow-inner flex flex-col items-center gap-2">
                            <img 
                              src={q.imageUrl} 
                              alt="Apoio visual" 
                              className="max-w-full h-auto rounded-lg"
                              referrerPolicy="no-referrer"
                            />
                          </div>
                        )}
                        
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          {q.options.map((opt, idx) => (
                            <div 
                              key={idx}
                              className={`flex items-start gap-3 p-4 rounded-xl border transition-all ${
                                String.fromCharCode(65 + idx) === q.correctAnswer
                                  ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                                  : 'bg-slate-50 border-slate-100 text-slate-600'
                              }`}
                            >
                              <span className={`flex items-center justify-center w-7 h-7 rounded-lg border text-xs font-bold shrink-0 ${
                                String.fromCharCode(65 + idx) === q.correctAnswer
                                  ? 'bg-emerald-500 border-emerald-600 text-white'
                                  : 'bg-white border-slate-200 text-slate-500'
                              }`}>
                                {String.fromCharCode(65 + idx)}
                              </span>
                              <span className="pt-0.5">{opt}</span>
                            </div>
                          ))}
                        </div>

                        <div className="bg-slate-900 rounded-2xl p-6 text-white">
                          <div className="flex items-center gap-2 text-brand mb-2">
                            <Check className="w-4 h-4" />
                            <span className="text-[10px] font-black uppercase tracking-widest">Resolução</span>
                          </div>
                          <p className="text-slate-300 text-sm leading-relaxed">
                            {q.explanation}
                          </p>
                        </div>
                      </div>
                    </motion.div>
                  ))
                ) : (
                  <motion.div 
                    key="empty-favs"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="py-20 text-center bg-white rounded-3xl border-2 border-dashed border-slate-200"
                  >
                    <Star className="w-12 h-12 text-slate-200 mx-auto mb-4" />
                    <p className="text-slate-400 font-medium">Você ainda não favoritou nenhuma questão.</p>
                    <button 
                      onClick={() => setActiveTab('generator')}
                      className="mt-4 text-brand font-bold hover:underline"
                    >
                      Voltar ao gerador
                    </button>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>
        )}
      </main>

      <footer className="max-w-5xl mx-auto px-4 py-12 text-center border-t border-slate-200 mt-12">
        <p className="text-slate-400 text-sm">
          Desenvolvido para professores de matemática. Alinhado à BNCC.
        </p>
      </footer>
    </div>
  );
}
