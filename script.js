// =================================================================
// SCRIPT.JS - VERSÃO FINAL CORRIGIDA
// =================================================================

// ===== Firebase =====
const firebaseConfig = {
  apiKey: "AIzaSyD6m7jDQfeGgAaKozzHlXsHfv-AQXsaKd4",
  authDomain: "appapontamentoprodutividade.firebaseapp.com",
  projectId: "appapontamentoprodutividade",
  storageBucket: "appapontamentoprodutividade.firebasestorage.app",
  messagingSenderId: "775647390603",
  appId: "1:775647390603:web:9febe5c49f08e5c04cdd8e",
  measurementId: "G-69RHFDSX4G"
};

try {
    firebase.initializeApp(firebaseConfig);
} catch(e) {
    // Firebase já foi inicializado, o que é normal em ambientes de desenvolvimento com recarregamento.
}
const db = firebase.firestore();

// ===== Utils =====
let dadosDoRelatorio = [];
const TOTAL_COLABORADORES = 16;

const formatarTempo = (totalSegundos) => {
  if (isNaN(totalSegundos) || totalSegundos <= 0) return "00:00:00";
  const h = Math.floor(totalSegundos / 3600);
  const m = Math.floor((totalSegundos % 3600) / 60);
  const s = Math.floor(totalSegundos % 60);
  return [h, m, s].map(v => String(v).padStart(2, "0")).join(":");
};

const converterDuracaoParaSegundos = (duracaoStr) => {
    if (!duracaoStr || typeof duracaoStr !== 'string') return 0;
    const partes = duracaoStr.split(':');
    if (partes.length !== 3) return 0;
    const horas = parseInt(partes[0], 10) || 0;
    const minutos = parseInt(partes[1], 10) || 0;
    const segundos = parseInt(partes[2], 10) || 0;
    return (horas * 3600) + (minutos * 60) + segundos;
};

// ===== DOM Elements =====
const apontamentosTabela = document.getElementById("apontamentos-tabela");
const cardComApontamento = document.getElementById("card-com-apontamento");
const cardSemApontamento = document.getElementById("card-sem-apontamento");
const cardParados = document.getElementById("card-parados");
const cardParadosContainer = document.querySelector(".info-card.parado");
const graficoAtividadesCanvas = document.getElementById("grafico-atividades");
const graficoProdutividadeCanvas = document.getElementById("grafico-produtividade");
const filtroDataInicio = document.getElementById("filtro-data-inicio");
const filtroDataFim = document.getElementById("filtro-data-fim");
const btnFiltrar = document.getElementById("btn-filtrar");
const btnLimpar = document.getElementById("btn-limpar");
const btnLimparPainel = document.getElementById("btn-limpar-painel");
const btnExportarExcel = document.getElementById("btn-exportar-excel");
const btnExportarExcelDetalhado = document.getElementById("btn-exportar-excel-detalhado");
const btnExportarPdf = document.getElementById("btn-exportar-pdf");

// ===== Chart Instances =====
let graficoAtividades;
let graficoProdutividade;

const ATIVIDADES = ["Checklist", "Deslocamento", "Em Atividade", "Parado", "Almoço", "Aguardando cliente", "Carregamento"];
const CORES_ATIVIDADES = {
 "Checklist": "#8e00e0ff", 
 "Deslocamento": "#d1d400ff", 
 "Em Atividade": "#38c202ff",
 "Parado": "#ff0800ff", 
 "Almoço": "#0594e7ff", 
 "Aguardando cliente": "#fd7a00ff", 
 "Carregamento": "#5a5a59ff",
};

// ===== Render Functions =====
const renderizarStatusAtual = (ultimosApontamentos) => {
  if (!apontamentosTabela) return;
  apontamentosTabela.innerHTML = "";
  const totalComApontamento = ultimosApontamentos.length;
  let totalParados = 0;

  ultimosApontamentos.sort((a, b) => {
    const tA = a.dataHoraClique || 0;
    const tB = b.dataHoraClique || 0;
    return tB - tA;
  });

  ultimosApontamentos.forEach(a => {
    const cliente = a.clientName || "—";
    const colaborador = a.colaboradorNome || "N/A";
    const atividade = a.atividadeClicada || "N/A";
    const dataHora = a.dataHoraClique ? new Date(a.dataHoraClique).toLocaleString() : "Data inválida";
    const motivo = a.motivo || "";

    if (atividade.toLowerCase() === "parado") totalParados++;

    const tr = document.createElement("tr");

    if (atividade.toLowerCase() === "aguardando cliente") {
      tr.style.backgroundColor = "#fd7a00";
      tr.style.color = "#fff";
    }

    tr.innerHTML = `
      <td>${cliente}</td>
      <td>${colaborador}</td>
      <td>${atividade}</td>
      <td>${dataHora}</td>
      <td>${motivo}</td>
    `;
    apontamentosTabela.appendChild(tr);
  });

  if (cardComApontamento) cardComApontamento.textContent = totalComApontamento;
  if (cardSemApontamento) cardSemApontamento.textContent = TOTAL_COLABORADORES - totalComApontamento;
  if (cardParados) cardParados.textContent = totalParados;
  if (cardParadosContainer) cardParadosContainer.classList.toggle("alerta-parado", totalParados > 0);
};

const atualizarGraficoPizzaHistorico = (apontamentos) => {
    if (!graficoAtividadesCanvas) return;
    if (graficoAtividades) graficoAtividades.destroy();
    
    const contagem = {};
    apontamentos.forEach(a => {
        const atividadePadronizada = a.atividadeClicada || a.atividade;
        const duracaoSegundos = converterDuracaoParaSegundos(a.duracaoFormatada);
        if (atividadePadronizada) {
            contagem[atividadePadronizada] = (contagem[atividadePadronizada] || 0) + duracaoSegundos;
        }
    });

    const labels = Object.keys(contagem);
    const data = labels.map(label => contagem[label]);
    const backgroundColors = labels.map(label => CORES_ATIVIDADES[label] || '#607D8B');

    if (labels.length === 0) {
        if (graficoAtividades) graficoAtividades.destroy();
        return;
    }

    graficoAtividades = new Chart(graficoAtividadesCanvas, {
        type: 'doughnut',
        data: {
            labels: labels,
            datasets: [{
                data: data,
                backgroundColor: backgroundColors,
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { position: 'top' },
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            let label = context.label || '';
                            if (label) {
                                label += ': ';
                            }
                            if (context.parsed) {
                                label += formatarTempo(context.parsed);
                            }
                            return label;
                        }
                    }
                }
            }
        },
    });
};

const renderizarGraficoProdutividade = (apontamentos) => {
  if (!graficoProdutividadeCanvas) return;
  if (graficoProdutividade) graficoProdutividade.destroy();

  const apontamentosValidos = apontamentos.filter(a => a.colaboradorNome);
  const porColaborador = {};
  apontamentosValidos.forEach(a => {
    const col = a.colaboradorNome || "—";
    const ativ = (a.atividadeClicada || a.atividade || "—");
    const seg = converterDuracaoParaSegundos(a.duracaoFormatada);

    if (!porColaborador[col]) {
      porColaborador[col] = {};
      ATIVIDADES.forEach(act => porColaborador[col][act] = 0);
    }
    porColaborador[col][ativ] += seg;
  });

  const colaboradores = Object.keys(porColaborador).sort();
  if (colaboradores.length === 0) {
      if (graficoProdutividade) graficoProdutividade.destroy();
      return;
  }

  const datasets = ATIVIDADES.map(atividade => ({
    label: atividade,
    data: colaboradores.map(c => porColaborador[c][atividade] || 0),
    backgroundColor: CORES_ATIVIDADES[atividade]
  }));

  graficoProdutividade = new Chart(graficoProdutividadeCanvas, {
    type: "bar",
    data: { labels: colaboradores, datasets },
    options: {
      responsive: true,
      scales: { x: { stacked: true }, y: { stacked: true, ticks: { callback: v => formatarTempo(v) } } },
      plugins: { tooltip: { callbacks: { label: ctx => `${ctx.dataset.label}: ${formatarTempo(ctx.parsed.y)}` } } }
    }
  });
};

// ===== Data Fetching e Event Listeners =====
const carregarDadosDoPainel = async (dataInicioStr = null, dataFimStr = null) => {
  limparPainelVisualmente();
  let inicio, fim;
  if (dataInicioStr && dataFimStr) {
    inicio = new Date(dataInicioStr);
    inicio.setHours(0, 0, 0, 0);
    fim = new Date(dataFimStr);
    fim.setHours(23, 59, 59, 999);
  } else {
    const hoje = new Date();
    inicio = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate(), 0, 0, 0, 0);
    fim = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate(), 23, 59, 59, 999);
  }

  // Realtime
  db.collection("apontamentos_realtime")
    .orderBy("dataHoraClique", "desc")
    .onSnapshot((snap) => {
    if (snap.empty) {
      renderizarStatusAtual([]);
      return;
    }
    const ultimosApontamentosMap = new Map();
    snap.forEach(doc => {
      const apontamento = doc.data();
      if (!ultimosApontamentosMap.has(apontamento.colaboradorNome)) {
        ultimosApontamentosMap.set(apontamento.colaboradorNome, apontamento);
      }
    });
    renderizarStatusAtual(Array.from(ultimosApontamentosMap.values()));
  }, (error) => {
    console.error("Erro ao buscar status em tempo real:", error);
  });
  
  // Histórico
  try {
    const snapshot = await db.collection("apontamentos").get();
    const apontamentosDoPeriodo = [];

    snapshot.forEach(doc => {
      const dado = doc.data();
      const dataDocStr = dado.dataRegistro;
      // Tratar a string de data para garantir o formato correto para Date()
      // substitui todos os espaços ' ' por 'T'
      
      // CORREÇÃO: Verifica se 'dataDocStr' existe antes de tentar usar o 'replace'
      if (dataDocStr) {
          const dataDoc = new Date(dataDocStr.replace(/ /g, "T"));
          if (dataDoc >= inicio && dataDoc <= fim) {
            apontamentosDoPeriodo.push(dado);
          }
      }
    });

    if (apontamentosDoPeriodo.length > 0) {
      // Guarda os dados para exportação
      dadosDoRelatorio = apontamentosDoPeriodo;
      atualizarGraficoPizzaHistorico(apontamentosDoPeriodo);
      renderizarGraficoProdutividade(apontamentosDoPeriodo);
    } else {
      console.log("Nenhum dado histórico encontrado para os gráficos no período selecionado.");
      // CORREÇÃO: Destruir os gráficos sem remover o elemento canvas
      if (graficoAtividades) {
          graficoAtividades.destroy();
          graficoAtividades = null;
      }
      if (graficoProdutividade) {
          graficoProdutividade.destroy();
          graficoProdutividade = null;
      }
      // Limpar os dados exportáveis
      dadosDoRelatorio = [];
    }
  } catch(error) {
    console.error("Erro ao buscar dados históricos:", error);
  }
};


const zerarRegistrosDoBanco = () => {
  if (confirm("ATENÇÃO: Você tem certeza que deseja apagar TODOS os registros de (apontamentos_realtime) e (apontamentos)? Esta ação é irreversível.")) {
    const apontamentosRealtimeRef = db.collection("apontamentos_realtime");
    const apontamentosRef = db.collection("apontamentos");

    apontamentosRealtimeRef.get().then(snapshot => {
      const batch = db.batch();
      snapshot.docs.forEach(doc => {
        batch.delete(doc.ref);
      });
      return batch.commit();
    }).then(() => {
      return apontamentosRef.get().then(snapshot => {
        const batch = db.batch();
        snapshot.docs.forEach(doc => {
          batch.delete(doc.ref);
        });
        return batch.commit();
      });
    }).then(() => {
      alert("Todos os registros foram excluídos com sucesso!");
      limparPainelVisualmente();
      carregarDadosDoPainel();
    }).catch(error => {
      console.error("Erro ao apagar registros:", error);
      alert("Ocorreu um erro ao apagar os registros.");
    });
  }
};

const limparPainelVisualmente = () => {
    if (cardComApontamento) cardComApontamento.textContent = 0;
    if (cardSemApontamento) cardSemApontamento.textContent = TOTAL_COLABORADORES;
    if (cardParados) cardParados.textContent = 0;
    if (apontamentosTabela) apontamentosTabela.innerHTML = "<tr><td colspan='4'>Carregando dados...</td></tr>";
    if (cardParadosContainer) cardParadosContainer.classList.remove("alerta-parado");
};

const exportarProdutividadeExcel = () => {
    if (!dadosDoRelatorio || dadosDoRelatorio.length === 0) {
        alert("Nenhum dado para exportar.");
        return;
    }
    const porColaborador = {};
    const ATIVIDADES_EXPORT = [...ATIVIDADES, "Tempo Total"];

    dadosDoRelatorio.forEach(a => {
        const col = a.colaboradorNome || "—";
        const ativ = a.atividadeClicada || "—";
        const seg = converterDuracaoParaSegundos(a.duracaoFormatada);
        if (!porColaborador[col]) {
            porColaborador[col] = {};
            ATIVIDADES_EXPORT.forEach(act => porColaborador[col][act] = 0);
        }
        porColaborador[col][ativ] += seg;
        porColaborador[col]["Tempo Total"] += seg;
    });

    const exportData = Object.entries(porColaborador).map(([colaborador, tempos]) => {
        const row = { "Colaborador": colaborador };
        ATIVIDADES_EXPORT.forEach(atividade => {
            row[atividade] = formatarTempo(tempos[atividade]);
        });
        return row;
    });
    const worksheet = XLSX.utils.json_to_sheet(exportData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Produtividade por Colaborador");
    XLSX.writeFile(workbook, "produtividade_colaboradores.xlsx");
};

const exportarDetalhadoExcel = () => {
    if (!dadosDoRelatorio || dadosDoRelatorio.length === 0) {
        alert("Nenhum dado para exportar.");
        return;
    }
    const exportData = dadosDoRelatorio.map(a => ({
        "Cliente": a.clientName || "N/A",
        "Colaborador": a.colaboradorNome || "N/A",
        "Atividade": a.atividadeClicada || "N/A",
        "Data e Hora": a.dataHoraClique ? new Date(a.dataHoraClique).toLocaleString() : "Data inválida",
        "Motivo": a.motivo || "N/A",
        "Localização": a.localizacao
    }));
    const worksheet = XLSX.utils.json_to_sheet(exportData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Apontamentos Detalhados");
    XLSX.writeFile(workbook, "apontamentos_detalhados.xlsx");
};

const exportarHistoricoPdf = () => {
    const tabelaParaImpressao = document.getElementById("tabela-apontamentos").cloneNode(true);
    const win = window.open('', '', 'height=700,width=700');
    win.document.write("<html><head><title>Relatório de Atividades</title>");
    win.document.write("<style>");
    win.document.write("body { font-family: sans-serif; }");
    win.document.write("h1 { text-align: center; }");
    win.document.write("table { width: 100%; border-collapse: collapse; }");
    win.document.write("th, td { border: 1px solid #ccc; padding: 8px; text-align: left; }");
    win.document.write("th { background-color: #f2f2f2; }");
    win.document.write("</style>");
    win.document.write("</head><body>");
    win.document.write("<h1>Relatório de Atividades</h1>");
    win.document.write(tabelaParaImpressao.outerHTML);
    win.document.write("</body></html>");
    win.document.close();
    win.print();
};


if (btnFiltrar) {
    btnFiltrar.addEventListener("click", () => {
        const dataInicio = filtroDataInicio.value;
        const dataFim = filtroDataFim.value;
        if (!dataInicio || !dataFim) {
            return alert("Por favor, selecione a data de início e a data de fim para filtrar.");
        }
        carregarDadosDoPainel(dataInicio, dataFim);
    });
}

if (btnLimpar) {
    btnLimpar.addEventListener("click", () => {
        if(filtroDataInicio) filtroDataInicio.value = "";
        if(filtroDataFim) filtroDataFim.value = "";
        carregarDadosDoPainel();
    });
}

if (btnLimparPainel) btnLimparPainel.addEventListener("click", zerarRegistrosDoBanco);
if (btnExportarExcel) btnExportarExcel.addEventListener("click", exportarProdutividadeExcel);
if (btnExportarExcelDetalhado) btnExportarExcelDetalhado.addEventListener("click", exportarDetalhadoExcel);
if (btnExportarPdf) btnExportarPdf.addEventListener("click", exportarHistoricoPdf);

document.addEventListener('DOMContentLoaded', () => {
    carregarDadosDoPainel();
});