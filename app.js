class GraphQLProfileApp {
    constructor() {
        this.apiUrl = 'https://learn.zone01kisumu.ke/api/graphql-engine/v1/graphql';
        this.authUrl = 'https://learn.zone01kisumu.ke/api/auth/signin';
        this.token = localStorage.getItem('jwtToken');
        this.userData = {
            user: null,
            transactions: [],
            progress: [],
            skills: [],
            audits: []
        };
        this.lastFetchedDataForResize = null;
        this.init();
    }

    init() {
        this.bindEvents();
        if (this.token) {
            this.showProfile();
        } else {
            this.showLogin();
        }
    }

    bindEvents() {
        document.getElementById('loginForm').addEventListener('submit', (e) => this.handleLogin(e));
        document.getElementById('logoutButton').addEventListener('click', () => this.handleLogout());
        
        let resizeTimeout;
        window.addEventListener('resize', () => {
            clearTimeout(resizeTimeout);
            resizeTimeout = setTimeout(() => {
                if (document.getElementById('profilePage').style.display !== 'none' && this.lastFetchedDataForResize) {
                    this.generateCharts(true);
                }
            }, 250);
        });
    }

    showLogin() {
        document.getElementById('loginPage').classList.remove('hidden');
        document.getElementById('profilePage').classList.add('hidden');
    }

    showProfile() {
        document.getElementById('loginPage').classList.add('hidden');
        document.getElementById('profilePage').classList.remove('hidden');
        document.getElementById('loadingSpinner').classList.remove('hidden');
        document.getElementById('mainContent').classList.add('hidden');
        this.loadProfileData();
    }

    async handleLogin(e) {
        e.preventDefault();
        
        const loginButton = document.getElementById('loginButton');
        const loginError = document.getElementById('loginError');
        const loginInput = document.getElementById('loginInput').value;
        const password = document.getElementById('passwordInput').value;

        loginButton.textContent = 'Signing in...';
        loginButton.disabled = true;
        loginError.classList.add('hidden');

        try {
            const credentials = btoa(`${loginInput}:${password}`);
            const response = await fetch(this.authUrl, {
                method: 'POST',
                headers: {
                    'Authorization': `Basic ${credentials}`,
                    'Content-Type': 'application/json'
                }
            });

            if (response.ok) {
                const token = await response.text();
                this.token = token.replace(/"/g, ''); 
                localStorage.setItem('jwtToken', this.token);
                this.showProfile();
            } else {
                 const errorData = await response.json().catch(() => ({ message: "Invalid credentials or server error" }));
                throw new Error(errorData.message || 'Invalid credentials');
            }
        } catch (error) {
            loginError.textContent = error.message || 'Invalid username/email or password. Please try again.';
            loginError.classList.remove('hidden');
        } finally {
            loginButton.textContent = 'Sign In';
            loginButton.disabled = false;
        }
    }

    handleLogout() {
        localStorage.removeItem('jwtToken');
        this.token = null;
        this.userData = { user: null, transactions: [], progress: [], skills: [], audits: [] };
        this.lastFetchedDataForResize = null;
        this.showLogin();
        document.getElementById('loginForm').reset();
    }

    async loadProfileData() {
        try {
            await this.loadUserInfo();
            await this.loadTransactions(); 
            await this.loadProgress();
            await this.loadAudits();

            this.lastFetchedDataForResize = { ...this.userData };

            this.displayUserInfo();
            this.calculateStats();
            this.generateCharts();
            
            document.getElementById('loadingSpinner').classList.add('hidden');
            document.getElementById('mainContent').classList.remove('hidden');
        } catch (error) {
            console.error('Error loading profile data:', error);
            const mainContent = document.getElementById('mainContent');
            mainContent.innerHTML = `<div class="text-center text-red-400 p-4 bg-red-900/30 rounded-lg">${error.message}. Try logging out and in.</div>`;
            mainContent.classList.remove('hidden');
            document.getElementById('loadingSpinner').classList.add('hidden');

            if (error.message.includes('401') || error.message.includes('Unauthorized') || error.message.includes('Forbidden')) {
                this.handleLogout();
            }
        }
    }

    async makeGraphQLQuery(query, variables = {}) {
        if (!this.token) {
            throw new Error("Authentication token not found. Please login.");
        }
        const response = await fetch(this.apiUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${this.token}`
            },
            body: JSON.stringify({ query, variables })
        });

        if (!response.ok) {
            const errorBody = await response.text();
            let errorMessage = `HTTP error! status: ${response.status}`;
            try {
                const parsedError = JSON.parse(errorBody);
                if (parsedError.errors && parsedError.errors.length > 0) {
                    errorMessage = parsedError.errors.map(e => e.message).join('; ');
                } else if (parsedError.message) {
                    errorMessage = parsedError.message;
                }
            } catch (e) {
                errorMessage = `HTTP error! status: ${response.status}. Response: ${errorBody.substring(0,100)}`;
            }
             if (response.status === 401 || response.status === 403) {
                errorMessage = `Unauthorized or Forbidden: ${errorMessage}. Your session might have expired.`;
            }
            throw new Error(errorMessage);
        }

        const data = await response.json();
        if (data.errors) {
            throw new Error(data.errors.map(e => e.message).join('; '));
        }
        
        return data.data;
    }

    async loadUserInfo() {
        const query = `{
            user {
                id
                login
            }
        }`;
        const data = await this.makeGraphQLQuery(query);
        this.userData.user = data.user && data.user.length > 0 ? data.user[0] : {id: 'N/A', login: 'N/A'};
    }

    async loadTransactions() {
        const query = `{
            transaction(where: {type: {_eq: "xp"}}) {
                id
                amount
                createdAt
                path
                object {
                    name
                }
            }
            skills: transaction(where: {type: {_like: "skill_%"}}, order_by: {amount: desc}) {
                type
                amount
            }
        }`;
        const data = await this.makeGraphQLQuery(query);
        this.userData.transactions = data.transaction || [];
        this.userData.skills = data.skills || [];
    }

    async loadProgress() {
        const query = `{
            progress {
                id
                grade 
                createdAt
                path
                object {
                    name
                    type
                }
            }
        }`;
        const data = await this.makeGraphQLQuery(query);
        this.userData.progress = data.progress || [];
    }

    async loadAudits() {
        const query = `{
            audit {
                id
                grade
                createdAt
                updatedAt
                group {
                    object {
                        name
                        type
                    }
                }
            }
        }`;
        const data = await this.makeGraphQLQuery(query);
        this.userData.audits = data.audit || [];
    }

    displayUserInfo() {
        const user = this.userData.user;
        document.getElementById('userId').textContent = user.id;
        document.getElementById('userLogin').textContent = user.login;
    }

    calculateStats() {
        const totalXP = this.userData.transactions
            .filter(t => !t.type || t.type === 'xp')
            .reduce((sum, t) => sum + (t.amount || 0), 0);
        document.getElementById('totalXP').textContent = totalXP.toLocaleString();

        // Calculate audit stats
        const audits = this.userData.audits || [];
        const completedAudits = audits.filter(a => a.grade !== null && a.grade !== undefined).length;
        const passedAudits = audits.filter(a => a.grade >= 1).length;
        const failedAudits = audits.filter(a => a.grade !== null && a.grade !== undefined && a.grade < 1).length;
        const averageGrade = completedAudits > 0 ? 
            (audits.filter(a => a.grade !== null).reduce((sum, a) => sum + a.grade, 0) / completedAudits * 100).toFixed(1) : 0;

        document.getElementById('completedProjects').textContent = completedAudits;
        document.getElementById('failedProjects').textContent = passedAudits;
        document.getElementById('successRate').textContent = `${averageGrade}%`;

        this.populateProjectsTable();
    }

    populateProjectsTable() {
        const tableBody = document.getElementById('projectsTable');
        const recentXPTransactions = this.userData.transactions
            .filter(t => !t.type || t.type === 'xp')
            .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
            .slice(0, 10);

        if (recentXPTransactions.length === 0) {
            tableBody.innerHTML = `<tr><td colspan="3" class="py-3 px-4 text-center text-gray-400">No XP transactions found.</td></tr>`;
            return;
        }
        
        tableBody.innerHTML = recentXPTransactions.map(transaction => {
            const date = new Date(transaction.createdAt).toLocaleDateString();
            const taskName = this.getProjectNameFromPath(transaction.path) || (transaction.object ? transaction.object.name : 'Unknown Task');
            
            return `
                <tr class="hover:bg-white/5 transition-colors">
                    <td class="py-3 px-4 text-white">${taskName}</td>
                    <td class="py-3 px-4 text-purple-300">${(transaction.amount).toLocaleString()}</td>
                    <td class="py-3 px-4 text-gray-300">${date}</td>
                </tr>
            `;
        }).join('');
    }
    
    getProjectNameFromPath(path) {
        if (!path) return "Unknown Project";
        const parts = path.split('/');
        let projectName = parts[parts.length - 1] || "Unnamed Project";
        if ((projectName === "" || projectName.match(/^\d+$/)) && parts.length > 1) { 
            projectName = parts[parts.length - 2] || "Unnamed Project";
        }
        projectName = projectName.replace(/^piscine-/, '').replace(/^quest-/, '');
        return projectName.split('-').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
    }

    generateCharts(isResize = false) {
        const dataToUse = isResize && this.lastFetchedDataForResize ? this.lastFetchedDataForResize : this.userData;
        this.renderXPByProjectChart(document.getElementById('xpByProjectChart'), dataToUse.transactions || []);
        this.renderSkillsChart(document.getElementById('skillsChart'), dataToUse.skills || []);
    }

    renderXPByProjectChart(svgElement, xpTransactions) {
        const projectXP = {};
        const filteredXpTransactions = xpTransactions.filter(tx => !tx.type || tx.type === 'xp');

        filteredXpTransactions.forEach(tx => {
            const projectName = this.getProjectNameFromPath(tx.path);
            projectXP[projectName] = (projectXP[projectName] || 0) + tx.amount;
        });

        const projects = Object.entries(projectXP);
        if (projects.length === 0) {
            svgElement.innerHTML = `<text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle" fill="#A0AEC0" font-size="14px">No project XP data available</text>`;
            return;
        }

        projects.sort((a, b) => b[1] - a[1]);
        const topProjects = projects.slice(0, 10);

        svgElement.innerHTML = '';

        const svgWidth = svgElement.clientWidth || 500;
        const svgHeight = parseInt(svgElement.getAttribute('height')) || 380;
        const margin = { top: 40, right: 30, bottom: 120, left: 70 };
        const chartWidth = svgWidth - margin.left - margin.right;
        const chartHeight = svgHeight - margin.top - margin.bottom;

        if (chartWidth <=0 || chartHeight <=0) {
            svgElement.innerHTML = `<text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle" fill="#A0AEC0" font-size="14px">Chart cannot be rendered (too small).</text>`;
            return;
        }

        const maxXP = Math.max(...topProjects.map(p => p[1]), 0);
        if (maxXP === 0 && topProjects.length > 0) {
            svgElement.innerHTML = `<text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle" fill="#A0AEC0" font-size="14px">All projects have 0 XP</text>`;
            return;
        }
        
        const barPadding = 0.3;
        const barWidth = chartWidth / topProjects.length * (1 - barPadding);
        const scaleY = val => chartHeight - (val / (maxXP || 1)) * chartHeight;

        topProjects.forEach((project, i) => {
            const x = margin.left + i * (chartWidth / topProjects.length) + (chartWidth / topProjects.length * barPadding / 2) + barWidth / 2;
            const textEl = document.createElementNS("http://www.w3.org/2000/svg", "text");
            textEl.setAttribute("x", x);
            textEl.setAttribute("y", svgHeight - margin.bottom + 25);
            textEl.setAttribute("text-anchor", "end");
            textEl.setAttribute("transform", `rotate(-55 ${x} ${svgHeight - margin.bottom + 25})`);
            textEl.setAttribute("font-size", "10px");
            textEl.setAttribute("fill", "#CBD5E0");
            let projectNameText = project[0];
            if (projectNameText.length > 15) projectNameText = projectNameText.substring(0, 12) + "...";
            textEl.textContent = projectNameText;
            svgElement.appendChild(textEl);
        });

        const yAxisGroup = document.createElementNS("http://www.w3.org/2000/svg", "g");
        yAxisGroup.setAttribute("transform", `translate(${margin.left}, ${margin.top})`);
        svgElement.appendChild(yAxisGroup);

        const numTicks = 5;
        for (let i = 0; i <= numTicks; i++) {
            const val = Math.round((maxXP / numTicks) * i);
            const yPos = scaleY(val);
            const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
            line.setAttribute("x1", 0); line.setAttribute("y1", yPos);
            line.setAttribute("x2", chartWidth); line.setAttribute("y2", yPos);
            line.setAttribute("stroke", "#4A5568");
            line.setAttribute("stroke-dasharray", "3,3");
            yAxisGroup.appendChild(line);
            const textEl = document.createElementNS("http://www.w3.org/2000/svg", "text");
            textEl.setAttribute("x", -12); textEl.setAttribute("y", yPos + 4);
            textEl.setAttribute("text-anchor", "end"); textEl.setAttribute("font-size", "11px");
            textEl.setAttribute("fill", "#A0AEC0"); 
            textEl.textContent = val.toLocaleString();
            yAxisGroup.appendChild(textEl);
        }

        const yAxisTitle = document.createElementNS("http://www.w3.org/2000/svg", "text");
        yAxisTitle.setAttribute("transform", "rotate(-90)");
        yAxisTitle.setAttribute("y", margin.left / 2 - 35);
        yAxisTitle.setAttribute("x", -(margin.top + chartHeight / 2));
        yAxisTitle.setAttribute("text-anchor", "middle"); yAxisTitle.setAttribute("font-size", "13px");
        yAxisTitle.setAttribute("font-weight", "500"); yAxisTitle.setAttribute("fill", "#E2E8F0");
        yAxisTitle.textContent = "XP Amount";
        svgElement.appendChild(yAxisTitle);

        topProjects.forEach((project, i) => {
            const x = margin.left + i * (chartWidth / topProjects.length) + (chartWidth / topProjects.length * barPadding / 2);
            const y = margin.top + scaleY(project[1]);
            const h = chartHeight - scaleY(project[1]);
            const w = barWidth;

            const rect = document.createElementNS("http://www.w3.org/2000/svg", "rect");
            rect.setAttribute("x", x); rect.setAttribute("y", y);
            rect.setAttribute("width", Math.max(0, w)); rect.setAttribute("height", Math.max(0, h));
            rect.setAttribute("fill", "url(#barGradient)");
            rect.setAttribute("rx", "3"); rect.setAttribute("ry", "3");
            rect.classList.add("chart-bar");

            const titleEl = document.createElementNS("http://www.w3.org/2000/svg", "title");
            titleEl.textContent = `${project[0]}: ${project[1].toLocaleString()} XP`;
            rect.appendChild(titleEl);
            svgElement.appendChild(rect);

            if (h > 15) {
                const valueText = document.createElementNS("http://www.w3.org/2000/svg", "text");
                valueText.setAttribute("x", x + w / 2); valueText.setAttribute("y", y - 7);
                valueText.setAttribute("text-anchor", "middle"); valueText.setAttribute("font-size", "10px");
                valueText.setAttribute("font-weight", "600"); valueText.setAttribute("fill", "#C3DAFE");
                valueText.textContent = project[1].toLocaleString(); 
                svgElement.appendChild(valueText);
            }
        });

        const defs = document.createElementNS("http://www.w3.org/2000/svg", "defs");
        const linearGradient = document.createElementNS("http://www.w3.org/2000/svg", "linearGradient");
        linearGradient.setAttribute("id", "barGradient");
        linearGradient.setAttribute("x1", "0%"); linearGradient.setAttribute("y1", "0%");
        linearGradient.setAttribute("x2", "0%"); linearGradient.setAttribute("y2", "100%");
        const stop1 = document.createElementNS("http://www.w3.org/2000/svg", "stop");
        stop1.setAttribute("offset", "0%");
        stop1.setAttribute("style", "stop-color:#A78BFA;stop-opacity:1");
        const stop2 = document.createElementNS("http://www.w3.org/2000/svg", "stop");
        stop2.setAttribute("offset", "100%");
        stop2.setAttribute("style", "stop-color:#7C3AED;stop-opacity:1");
        linearGradient.appendChild(stop1);
        linearGradient.appendChild(stop2);
        defs.appendChild(linearGradient);
        svgElement.appendChild(defs);
    }

    renderSkillsChart(svgElement, skillsData) {
        if (!Array.isArray(skillsData) || skillsData.length === 0) {
            svgElement.innerHTML = `<text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle" fill="#A0AEC0" font-size="14px">No skills data available.</text>`;
            return;
        }

        // Aggregate skills by type, taking the maximum value for each skill
        const skillsMap = {};
        skillsData.forEach(skill => {
            const skillType = skill.type.replace(/^skill_/, '');
            if (!skillsMap[skillType] || skillsMap[skillType] < skill.amount) {
                skillsMap[skillType] = skill.amount;
            }
        });

        // Convert to array and sort by amount
        const aggregatedSkills = Object.entries(skillsMap)
            .map(([type, amount]) => ({ type: `skill_${type}`, amount }))
            .sort((a, b) => b.amount - a.amount);

        const topSkills = aggregatedSkills.slice(0, 10);

        svgElement.innerHTML = '';

        const svgWidth = svgElement.clientWidth || 500;
        const svgHeight = parseInt(svgElement.getAttribute('height')) || 400; 
        const margin = { top: 40, right: 30, bottom: 100, left: 70 };
        const chartWidth = svgWidth - margin.left - margin.right;
        const chartHeight = svgHeight - margin.top - margin.bottom;
        
        if (chartWidth <= 0 || chartHeight <= 0) {
            svgElement.innerHTML = `<text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle" fill="#A0AEC0" font-size="14px">Chart cannot be rendered (too small).</text>`;
            return;
        }

        const maxAmount = Math.max(...topSkills.map(s => s.amount), 0);
        if (maxAmount === 0 && topSkills.length > 0) {
            svgElement.innerHTML = `<text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle" fill="#A0AEC0" font-size="14px">All skills have 0% progress.</text>`;
            return;
        }

        const barPadding = 0.3;
        const barWidth = chartWidth / topSkills.length * (1 - barPadding);
        const scaleY = val => (val / (maxAmount || 1)) * chartHeight;

        const chartGroup = document.createElementNS("http://www.w3.org/2000/svg", "g");
        chartGroup.setAttribute("transform", `translate(${margin.left}, ${margin.top})`);
        svgElement.appendChild(chartGroup);

        topSkills.forEach((skill, i) => {
            const x = i * (chartWidth / topSkills.length) + (chartWidth / topSkills.length * barPadding / 2);
            const barHeight = scaleY(skill.amount);
            const y = chartHeight - barHeight;

            // Skill name label
            const textEl = document.createElementNS("http://www.w3.org/2000/svg", "text");
            textEl.setAttribute("x", x + barWidth / 2);
            textEl.setAttribute("y", chartHeight + 25);
            textEl.setAttribute("text-anchor", "end");
            textEl.setAttribute("transform", `rotate(-45 ${x + barWidth/2} ${chartHeight + 25})`);
            textEl.setAttribute("font-size", "11px");
            textEl.setAttribute("fill", "#CBD5E0");
            
            let skillName = skill.type.replace(/^skill_/, '').replace(/_/g, ' ').replace(/-/g, ' ');
            // Capitalize each word
            skillName = skillName.split(' ').map(word => 
                word.charAt(0).toUpperCase() + word.slice(1)
            ).join(' ');
            
            if (skillName.length > 12) skillName = skillName.substring(0, 9) + "...";
            textEl.textContent = skillName;
            chartGroup.appendChild(textEl);

            // Skill bar
            const rect = document.createElementNS("http://www.w3.org/2000/svg", "rect");
            rect.setAttribute("x", x);
            rect.setAttribute("y", y);
            rect.setAttribute("width", Math.max(0, barWidth));
            rect.setAttribute("height", Math.max(0, barHeight));
            rect.setAttribute("fill", "url(#skillBarGradient)");
            rect.setAttribute("rx", "3");
            rect.setAttribute("ry", "3");
            rect.classList.add("chart-bar");

            const titleEl = document.createElementNS("http://www.w3.org/2000/svg", "title");
            titleEl.textContent = `${skillName}: ${skill.amount}%`;
            rect.appendChild(titleEl);
            chartGroup.appendChild(rect);

            // Value label on top of bar
            if (barHeight > 15) {
                const valueText = document.createElementNS("http://www.w3.org/2000/svg", "text");
                valueText.setAttribute("x", x + barWidth / 2);
                valueText.setAttribute("y", y - 5);
                valueText.setAttribute("text-anchor", "middle");
                valueText.setAttribute("font-size", "10px");
                valueText.setAttribute("font-weight", "600");
                valueText.setAttribute("fill", "#C3DAFE");
                valueText.textContent = skill.amount + "%";
                chartGroup.appendChild(valueText);
            }
        });

        // Y-axis grid lines and labels
        const yAxisGroup = document.createElementNS("http://www.w3.org/2000/svg", "g");
        chartGroup.appendChild(yAxisGroup);

        const numYTicks = 5;
        for (let i = 0; i <= numYTicks; i++) {
            const val = Math.round((maxAmount / numYTicks) * i);
            const yPos = chartHeight - scaleY(val);
            
            // Grid line
            const gridLine = document.createElementNS("http://www.w3.org/2000/svg", "line");
            gridLine.setAttribute("x1", 0); 
            gridLine.setAttribute("y1", yPos);
            gridLine.setAttribute("x2", chartWidth); 
            gridLine.setAttribute("y2", yPos);
            gridLine.setAttribute("stroke", "#4A5568"); 
            gridLine.setAttribute("stroke-dasharray", "2,2");
            yAxisGroup.appendChild(gridLine);
            
            // Y-axis label
            const tickText = document.createElementNS("http://www.w3.org/2000/svg", "text");
            tickText.setAttribute("x", -10); 
            tickText.setAttribute("y", yPos + 4);
            tickText.setAttribute("text-anchor", "end"); 
            tickText.setAttribute("font-size", "10px");
            tickText.setAttribute("fill", "#A0AEC0");
            tickText.textContent = val + "%";
            yAxisGroup.appendChild(tickText);
        }

        // Y-axis title
        const yAxisTitle = document.createElementNS("http://www.w3.org/2000/svg", "text");
        yAxisTitle.setAttribute("transform", "rotate(-90)");
        yAxisTitle.setAttribute("x", -(chartHeight / 2) - margin.top);
        yAxisTitle.setAttribute("y", -margin.left + 20);
        yAxisTitle.setAttribute("text-anchor", "middle");
        yAxisTitle.setAttribute("font-size", "12px");
        yAxisTitle.setAttribute("font-weight", "600");
        yAxisTitle.setAttribute("fill", "#E2E8F0");
        yAxisTitle.textContent = "Skill Level (%)";
        chartGroup.appendChild(yAxisTitle);

        // Create gradient definition
        const defs = document.createElementNS("http://www.w3.org/2000/svg", "defs");
        const skillGradient = document.createElementNS("http://www.w3.org/2000/svg", "linearGradient");
        skillGradient.setAttribute("id", "skillBarGradient");
        skillGradient.setAttribute("x1", "0%"); 
        skillGradient.setAttribute("y1", "0%");
        skillGradient.setAttribute("x2", "0%"); 
        skillGradient.setAttribute("y2", "100%");
        
        const stopS1 = document.createElementNS("http://www.w3.org/2000/svg", "stop");
        stopS1.setAttribute("offset", "0%");
        stopS1.setAttribute("style", "stop-color:#F472B6;stop-opacity:1");
        
        const stopS2 = document.createElementNS("http://www.w3.org/2000/svg", "stop");
        stopS2.setAttribute("offset", "100%");
        stopS2.setAttribute("style", "stop-color:#EC4899;stop-opacity:1");
        
        skillGradient.appendChild(stopS1);
        skillGradient.appendChild(stopS2);
        defs.appendChild(skillGradient);
        svgElement.appendChild(defs);
    }
}

document.addEventListener('DOMContentLoaded', () => {
    new GraphQLProfileApp();
});