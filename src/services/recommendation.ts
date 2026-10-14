import { CampusSpace } from '../types/campus';
import { CAMPUS_SPACES } from '../data/floorplanData';

export interface SpotRecommendation {
  space: CampusSpace;
  score: number; // 0 to 100
  matchReason: string;
  environmentalHighlight: string;
  featuresHighlight: string[];
}

export interface RecommendationQuery {
  intent: 'quiet' | 'group' | 'cool' | 'ventilated' | 'read' | 'maker' | 'relax' | 'custom';
  customKeyword?: string;
}

export function recommendCampusSpots(query: RecommendationQuery): SpotRecommendation[] {
  // Recommendations require a source-room label anchor; boundaries remain illustrative.
  const openSpaces = CAMPUS_SPACES.filter(
    (s) => s.access === 'open' && s.locationProvenance === 'derived' && !s.environment.isPrivateRoom
  );

  const results: SpotRecommendation[] = [];

  for (const space of openSpaces) {
    let score = 50;
    const reasons: string[] = [];

    // Occupancy bonus: Available is preferred over Crowded
    if (space.occupancy === 'available') {
      score += 20;
    } else if (space.occupancy === 'in_use') {
      score += 5;
    } else if (space.occupancy === 'crowded') {
      score -= 25;
    }

    const { temperature, co2, humidity } = space.environment;

    switch (query.intent) {
      case 'quiet':
        if (space.category === 'quiet_study') {
          score += 40;
          reasons.push('经声学隔音与静音规范设计的专属自习空间');
        } else if (space.category === 'library_reading') {
          score += 25;
          reasons.push('学术阅览室，整体声场安静适宜');
        } else if (space.category === 'arena' || space.category === 'dining') {
          score -= 50;
        }
        if (space.pulse === 'quiet') {
          score += 15;
          reasons.push('当前人流脉动为静谧状态');
        }
        break;

      case 'group':
      case 'custom':
        if (query.customKeyword?.includes('研讨') || query.customKeyword?.includes('讨论') || query.intent === 'group') {
          if (space.tags.some((t) => t.includes('Discussion') || t.includes('Conversation') || t.includes('College'))) {
            score += 35;
            reasons.push('配备讨论桌椅与白板，允许并鼓励畅快交流');
          }
          if (space.category === 'quiet_study') {
            score -= 40; // Silent rooms forbid loud talk
          }
        }
        break;

      case 'cool':
        // Prefer lower temperature (< 22.5°C)
        if (temperature <= 22.2) {
          score += 35;
          reasons.push(`当前实时温度 ${temperature}°C，室内清凉干爽`);
        } else if (temperature >= 23.8) {
          score -= 20;
        }
        break;

      case 'ventilated':
        // Good ventilation: low CO2 (< 550 ppm) or courtyard
        if (co2 < 550) {
          score += 35;
          reasons.push(`CO₂ 浓度仅为 ${co2} ppm，新风换气效率极佳`);
        } else if (space.category === 'courtyard') {
          score += 40;
          reasons.push('露天中庭天井，天然新鲜空气对流');
        }
        break;

      case 'read':
        if (space.category === 'library_reading') {
          score += 40;
          reasons.push('馆藏书刊丰富，实木大长桌与柔光阅读照明');
        } else if (space.category === 'courtyard' || space.id === 'TEA-ROOM-01') {
          score += 25;
          reasons.push('环境雅致舒适，适合单人阅读与放空');
        }
        break;

      case 'maker':
        if (space.category === 'creative_maker') {
          score += 40;
          reasons.push('配备工具仪器、白板与原型材料的造物工坊');
        }
        break;

      case 'relax':
        if (space.category === 'courtyard' || space.category === 'dining') {
          score += 35;
          reasons.push('中庭绿植或轻食休闲区，身心放松首选');
        }
        break;
    }

    // Match custom keyword if provided
    if (query.customKeyword) {
      const kw = query.customKeyword.toLowerCase();
      const matchInName = space.name.toLowerCase().includes(kw);
      const matchInDesc = space.description.toLowerCase().includes(kw);
      const matchInTag = space.tags.some((t) => t.toLowerCase().includes(kw));
      const matchInFeat = space.features.some((f) => f.toLowerCase().includes(kw));

      if (matchInName || matchInTag) {
        score += 30;
        reasons.push(`关键词匹配空间特征`);
      } else if (matchInDesc || matchInFeat) {
        score += 15;
      }
    }

    if (score >= 45) {
      results.push({
        space,
        score: Math.min(100, Math.max(0, score)),
        matchReason: reasons.length > 0 ? reasons.join('；') : '空间当前开放，环境与活动状态适宜。',
        environmentalHighlight: `${temperature}°C · 湿度 ${humidity}% · CO₂ ${co2} ppm`,
        featuresHighlight: space.features.slice(0, 3),
      });
    }
  }

  return results.sort((a, b) => b.score - a.score).slice(0, 5);
}
