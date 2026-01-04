(function(){
  'use strict';

  
  const CACHE_DURATION = 7 * 24 * 60 * 60 * 1000;
  const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
  
  const GITHUB_DATA_URL = 'https://raw.githubusercontent.com/LegacyHockey/legacy-hockey-data/main/stats-2025-26.json';
  const SEASON = '948428';
  const GRADE_FILTER = '9';
  const TITLE = 'Top 100 Freshman Scoring Leaders';
  
  async function createTop100Table() {
    console.log('Starting Top 100 script...');
    showLoadingIndicator('Loading player stats from GitHub...');
    
    try {
      const response = await fetch(GITHUB_DATA_URL + '?t=' + Date.now());
      if (!response.ok) {
        throw new Error('Failed to load data from GitHub');
      }
      
      const data = await response.json();
      const statsData = data.players;
      
      console.log('Loaded ' + statsData.length + ' players from GitHub');
      console.log('Last updated: ' + data.lastUpdated);
      
      const teamIds = new Set();
      statsData.forEach(function(player) {
        if (player.teamId) {
          teamIds.add(player.teamId);
        }
      });
      
      console.log('Found ' + teamIds.size + ' teams');
      showLoadingIndicator('Loading roster data for ' + teamIds.size + ' teams...');
      
      const playerData = {};
      const teamNames = {};
      let loadedCount = 0;
      
      for (const teamId of teamIds) {
        try {
          const cacheKey = 'team_' + teamId + '_' + SEASON;
          let teamRoster = null;
          let teamName = '';
          
          const cached = localStorage.getItem(cacheKey);
          if (cached) {
            const parsedCache = JSON.parse(cached);
            if (Date.now() - parsedCache.timestamp < CACHE_DURATION) {
              teamRoster = parsedCache.data;
              teamName = parsedCache.teamName || '';
            }
          }
          
          if (!teamRoster) {
            const result = await fetchTeamRoster(teamId, SEASON);
            teamRoster = result.players;
            teamName = result.teamName;
            
            try {
              localStorage.setItem(cacheKey, JSON.stringify({
                data: teamRoster,
                teamName: teamName,
                timestamp: Date.now()
              }));
            } catch (e) {
              console.warn('Could not cache:', e.message);
            }
            
            await new Promise(function(resolve) { setTimeout(resolve, isMobile ? 150 : 50); });
          }
          
          Object.assign(playerData, teamRoster);
          if (teamName) {
            teamNames[teamId] = teamName;
          }
          loadedCount++;
          
          if (loadedCount % 5 === 0 || loadedCount === teamIds.size) {
            showLoadingIndicator('Loading rosters... ' + loadedCount + '/' + teamIds.size);
          }
        } catch (error) {
          console.error('Failed to fetch team ' + teamId + ':', error.message);
        }
      }
      
      console.log('Loaded ' + Object.keys(playerData).length + ' players from rosters');
      
      const players = [];
      statsData.forEach(function(statPlayer) {
        if (statPlayer.playerId) {
          const rosterInfo = playerData[statPlayer.playerId];
          
          if (rosterInfo && rosterInfo.grade === GRADE_FILTER) {
            const fullTeamName = teamNames[statPlayer.teamId] || statPlayer.teamName;
            
            players.push({
              name: statPlayer.name,
              team: fullTeamName,
              position: rosterInfo.position,
              grade: rosterInfo.grade,
              gp: statPlayer.gp,
              goals: statPlayer.goals,
              assists: statPlayer.assists,
              points: statPlayer.points
            });
          }
        }
      });
      
      players.sort(function(a, b) { return b.points - a.points; });
      const top100 = players.slice(0, 100);
      
      console.log('Found ' + players.length + ' players in grade ' + GRADE_FILTER + ', showing top 100');
      
      hideLoadingIndicator();
      displayTable(top100, data.lastUpdated);
      
    } catch (error) {
      console.error('Error:', error);
      hideLoadingIndicator();
      showError('Failed to load data: ' + error.message);
    }
  }
  
  async function fetchTeamRoster(teamId, season) {
    const url = 'https://www.legacy.hockey/roster/show/' + teamId + '?subseason=' + season;
    
    const controller = new AbortController();
    const timeout = setTimeout(function() { controller.abort(); }, 10000);
    
    try {
      const response = await fetch(url, { signal: controller.signal });
      clearTimeout(timeout);
      
      if (!response.ok) {
        throw new Error('HTTP ' + response.status);
      }
      
      const html = await response.text();
      const doc = new DOMParser().parseFromString(html, 'text/html');
      const playerMap = {};
      
      let teamName = '';
      const titleElement = doc.querySelector('h1.page-title, h1');
      if (titleElement) {
        teamName = titleElement.textContent.trim();
        teamName = teamName.replace(/\s*Roster\s*/i, '').replace(/\s*\d{4}-\d{4}\s*/, '').trim();
      }
      
      doc.querySelectorAll('table tbody tr').forEach(function(row) {
        const cells = row.querySelectorAll('td');
        if (cells.length >= 5) {
          const number = cells[0]?.textContent?.trim();
          const nameLink = cells[2]?.querySelector('a');
          const playerIdMatch = nameLink?.href?.match(/roster_players\/(\d+)/);
          const position = cells[3]?.textContent?.trim();
          const grade = cells[4]?.textContent?.trim();
          
          if (playerIdMatch && number !== 'MGR') {
            playerMap[playerIdMatch[1]] = {
              number: number,
              position: position || '',
              grade: grade || ''
            };
          }
        }
      });
      
      return { players: playerMap, teamName: teamName };
    } catch (error) {
      clearTimeout(timeout);
      throw error;
    }
  }
  
  function displayTable(players, lastUpdated) {
    const container = document.createElement('div');
    container.style.cssText = 'margin: 20px auto; padding: 20px; max-width: 1200px; background: white; border-radius: 8px; box-shadow: 0 2px 8px rgba(0,0,0,0.1);';
    
    const heading = document.createElement('h2');
    heading.textContent = TITLE;
    heading.style.cssText = 'margin: 0 0 10px 0; font-size: 28px; font-weight: bold; text-align: center; color: #333;';
    container.appendChild(heading);
    
    const updated = document.createElement('p');
    const updateDate = new Date(lastUpdated);
    updated.textContent = 'Last updated: ' + updateDate.toLocaleDateString() + ' ' + updateDate.toLocaleTimeString();
    updated.style.cssText = 'margin: 0 0 20px 0; text-align: center; color: #666; font-size: 14px;';
    container.appendChild(updated);
    
    const table = document.createElement('table');
    table.style.cssText = 'width: 100%; border-collapse: collapse; font-size: 14px;';
    
    const thead = document.createElement('thead');
    const headerRow = document.createElement('tr');
    headerRow.style.cssText = 'background: #f5f5f5;';
    
    ['Rank', 'Name', 'Team', 'Pos', 'GP', 'G', 'A', 'PTS'].forEach(function(text) {
      const th = document.createElement('th');
      th.textContent = text;
      th.style.cssText = 'padding: 12px 8px; text-align: left; border-bottom: 2px solid #ddd; font-weight: bold;';
      headerRow.appendChild(th);
    });
    thead.appendChild(headerRow);
    table.appendChild(thead);
    
    const tbody = document.createElement('tbody');
    players.forEach(function(player, index) {
      const row = document.createElement('tr');
      row.style.cssText = 'border-bottom: 1px solid #eee;' + (index % 2 === 0 ? ' background: #fafafa;' : '');
      
      [
        (index + 1).toString(),
        player.name,
        player.team,
        player.position,
        player.gp.toString(),
        player.goals.toString(),
        player.assists.toString(),
        player.points.toString()
      ].forEach(function(text, i) {
        const td = document.createElement('td');
        td.textContent = text;
        td.style.cssText = 'padding: 10px 8px;' + (i === 0 ? ' font-weight: bold; text-align: center;' : '');
        row.appendChild(td);
      });
      
      tbody.appendChild(row);
    });
    table.appendChild(tbody);
    
    container.appendChild(table);
    document.body.appendChild(container);
  }
  
  function showLoadingIndicator(message) {
    let indicator = document.getElementById('top100-loading');
    
    if (!indicator) {
      indicator = document.createElement('div');
      indicator.id = 'top100-loading';
      indicator.style.cssText = 'position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%);' +
        'background: white; padding: 30px 40px; border-radius: 8px; box-shadow: 0 4px 20px rgba(0,0,0,0.2);' +
        'z-index: 99999; text-align: center;';
      document.body.appendChild(indicator);
      
      const style = document.createElement('style');
      style.textContent = '@keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }';
      document.head.appendChild(style);
    }
    
    indicator.innerHTML = '<div style="display: inline-block; width: 40px; height: 40px; border: 4px solid #f3f3f3; ' +
      'border-top: 4px solid #3498db; border-radius: 50%; animation: spin 1s linear infinite;"></div>' +
      '<p style="margin: 15px 0 0 0; font-size: 16px; color: #333;">' + message + '</p>';
  }
  
  function hideLoadingIndicator() {
    const indicator = document.getElementById('top100-loading');
    if (indicator) {
      indicator.remove();
    }
  }
  
  function showError(message) {
    const error = document.createElement('div');
    error.style.cssText = 'margin: 20px auto; padding: 20px; max-width: 600px; background: #fee; border: 2px solid #f66;' +
      'border-radius: 8px; text-align: center; font-size: 16px; color: #c00;';
    error.textContent = message;
    document.body.appendChild(error);
  }
  
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function() {
      setTimeout(createTop100Table, 1000);
    });
  } else {
    setTimeout(createTop100Table, 1000);
  }
  
})();
