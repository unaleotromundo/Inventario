/**
 * Web Auditor - Roadmap Prioritization Module
 * Groups issues into quadrants based on Impact and Effort.
 */

export function prioritizeIssues(issues) {
  const columns = {
    'quick-wins': {
      title: '🚀 Quick Wins (Fáciles y de Alto Impacto)',
      subtitle: 'Resolver primero para obtener resultados rápidos.',
      items: []
    },
    'strategic': {
      title: '🎯 Proyectos Estratégicos (Alto Impacto y Mayor Esfuerzo)',
      subtitle: 'Requieren planificación y tiempo, pero aportan mucho valor.',
      items: []
    },
    'minor-tweaks': {
      title: '🔧 Retoques Menores (Bajo Impacto y Bajo Esfuerzo)',
      subtitle: 'Tareas sencillas que limpian y optimizan la web.',
      items: []
    },
    'long-term': {
      title: '⏳ Largo Plazo / Postergar (Bajo Impacto y Alto Esfuerzo)',
      subtitle: 'Tareas complejas con menor beneficio inmediato.',
      items: []
    }
  };

  issues.forEach(issue => {
    const { impact, effort } = issue;
    let type = '';

    if (impact === 'high' && effort === 'low') {
      type = 'quick-wins';
      issue.priorityNum = 1;
    } else if (impact === 'high' && effort === 'high') {
      type = 'strategic';
      issue.priorityNum = 2;
    } else if (impact === 'high' && effort === 'medium') {
      type = 'strategic';
      issue.priorityNum = 2;
    } else if (impact === 'medium' && effort === 'low') {
      type = 'minor-tweaks';
      issue.priorityNum = 3;
    } else if (impact === 'low' && effort === 'low') {
      type = 'minor-tweaks';
      issue.priorityNum = 3;
    } else if (impact === 'medium' && effort === 'medium') {
      type = 'strategic';
      issue.priorityNum = 2.5; // Intermediate strategic
    } else if (impact === 'medium' && effort === 'high') {
      type = 'long-term';
      issue.priorityNum = 4;
    } else if (impact === 'low' && effort === 'medium') {
      type = 'long-term';
      issue.priorityNum = 4;
    } else if (impact === 'low' && effort === 'high') {
      type = 'long-term';
      issue.priorityNum = 4.5;
    } else {
      type = 'minor-tweaks';
      issue.priorityNum = 3;
    }

    issue.roadmapGroup = type;
    columns[type].items.push(issue);
  });

  // Sort items in each column by priorityNum ascending
  Object.keys(columns).forEach(key => {
    columns[key].items.sort((a, b) => a.priorityNum - b.priorityNum);
  });

  return {
    columns,
    sortedIssues: [...issues].sort((a, b) => a.priorityNum - b.priorityNum)
  };
}

export function getImpactColor(impact) {
  switch (impact) {
    case 'high': return 'var(--color-danger)';
    case 'medium': return 'var(--color-warning)';
    case 'low': return 'var(--color-info)';
    default: return 'var(--color-text-muted)';
  }
}

export function getEffortColor(effort) {
  switch (effort) {
    case 'high': return 'var(--color-purple)';
    case 'medium': return 'var(--color-warning)';
    case 'low': return 'var(--color-success)';
    default: return 'var(--color-text-muted)';
  }
}
