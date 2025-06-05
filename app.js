// Main class for the GraphQL Profile Application
class GraphQLProfileApp {
    constructor() {
        this.apiUrl = 'https://learn.zone01kisumu.ke/api/graphql-engine/v1/graphql';
        this.authUrl = 'https://learn.zone01kisumu.ke/api/auth/signin';
        this.token = localStorage.getItem('jwtToken');
        // Initialize user data structure
        this.userData = {
            user: null, // Will store { id, login, auditRatio }
            transactions: [], // For XP transactions list (e.g., for the table)
            skills: [],
            progress: [],
            audits: [], // Original audits query (audits received on projects)
            auditsDoneCount: 0, // Count of audits performed by the user
            auditsReceivedCount: 0, // Count of audits received by the user (from transactions 'down')
            totalXpAmount: 0 // Stores the sum of all XP transactions
        };
        // Store last fetched data for efficient chart resizing
        this.lastFetchedDataForResize = null;
        this.init();
    }

    // Initializes the application, binds events, and checks authentication status
    init() {
        this.bindEvents();
        if (this.token) {
            this.showProfile();
        } else {
            this.showLogin();
        }
    }

    // Binds DOM event listeners
    bindEvents() {
        document.getElementById('loginForm').addEventListener('submit', (e) => this.handleLogin(e));
        document.getElementById('logoutButton').addEventListener('click', () => this.handleLogout());
        
        let resizeTimeout;
        // Debounced resize event listener for regenerating charts
        window.addEventListener('resize', () => {
            clearTimeout(resizeTimeout);
            resizeTimeout = setTimeout(() => {
                if (document.getElementById('profilePage').style.display !== 'none' && this.lastFetchedDataForResize) {
                    this.generateCharts(true); // Pass true if resizing
                }
            }, 250);
        });
    }

    // Shows the login page and hides the profile page
    showLogin() {
        document.getElementById('loginPage').classList.remove('hidden');
        document.getElementById('profilePage').classList.add('hidden');
    }

    // Shows the profile page, hides the login page, and initiates profile data loading
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
        this.userData = { 
            user: null, 
            transactions: [], 
            progress: [], 
            skills: [], 
            audits: [],
            auditsDoneCount: 0,
            auditsReceivedCount: 0,
            totalXpAmount: 0
        };
        this.lastFetchedDataForResize = null;
        this.showLogin();
        document.getElementById('loginForm').reset();
    }

    async loadProfileData() {
        try {
            await this.loadUserInfo(); // Fetches user info including auditRatio
            await this.loadTransactions(); // Fetches XP, skills, audit counts, and total XP sum
            await this.loadProgress(); // Fetches project progress
            await this.loadAudits(); // Fetches detailed audits 
            
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
                auditRatio 
            }
        }`;
        const data = await this.makeGraphQLQuery(query);
        this.userData.user = data.user && data.user.length > 0 
            ? data.user[0] 
            : {id: 'N/A', login: 'N/A', auditRatio: 0};
        if (this.userData.user && typeof this.userData.user.auditRatio === 'undefined') {
            this.userData.user.auditRatio = 0; 
        }
    }

    async loadTransactions() {
        // The key change is in the 'where' clause for 'totalXpSum'
        // It now includes a condition for eventId: 75, similar to your friend's query logic
        // for identifying XP-contributing transactions.
        const query = `query CombinedTransactionsAndAudits {
            transaction(where: {type: {_eq: "xp"}}) { # For recent transactions table & XP by project chart
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
            auditsDoneCount: transaction_aggregate(where: {type: {_eq: "up"}}) {
                aggregate {
                    count
                }
            }
            auditsReceivedCount: transaction_aggregate(where: {type: {_eq: "down"}}) {
                aggregate {
                    count
                }
            }
            totalXpSum: transaction_aggregate(where: { 
                _and: [
                    { type: {_eq: "xp"} }, 
                    { eventId: {_eq: 75} }
                ] 
            }) { # Aggregate total XP, considering both type "xp" and eventId 75
                aggregate {
                    sum {
                        amount
                    }
                }
            }
        }`;
        const data = await this.makeGraphQLQuery(query);
        this.userData.transactions = data.transaction || [];
        this.userData.skills = data.skills || [];
        this.userData.auditsDoneCount = data.auditsDoneCount?.aggregate?.count || 0;
        this.userData.auditsReceivedCount = data.auditsReceivedCount?.aggregate?.count || 0;
        this.userData.totalXpAmount = data.totalXpSum?.aggregate?.sum?.amount || 0;
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
        document.getElementById('userId').textContent = user.id || 'N/A';
        document.getElementById('userLogin').textContent = user.login || 'N/A';
    }

    formatXp(xp) {
        if (xp >= 1000000) { // Megabytes
            return (xp / 1000000).toFixed(1) + ' MB';
        } else if (xp >= 1000) { // Kilobytes
            return (xp / 1000).toFixed(1) + ' KB';
        } else { // Bytes (raw XP)
            return xp.toLocaleString() + ' XP';
        }
    }

    calculateStats() {
        // Use the pre-aggregated total XP
        const totalXP = this.userData.totalXpAmount;
        document.getElementById('totalXP').textContent = this.formatXp(totalXP);

        
        const auditRatio = this.userData.user?.auditRatio || 0;
        document.getElementById('auditRatioDisplay').textContent = parseFloat(auditRatio).toFixed(1);

        this.populateProjectsTable();
    }

    populateProjectsTable() {
        const tableBody = document.getElementById('projectsTable');
       
        const recentXPTransactions = this.userData.transactions 
            .filter(t => (!t.type || t.type === 'xp') && typeof t.amount === 'number') 
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
                    <td class="py-3 px-4 text-purple-300">${(transaction.amount || 0).toLocaleString()}</td>
                    <td class="py-3 px-4 text-gray-300">${date}</td>
                </tr>
            `;
        }).join('');
    }
    
    getProjectNameFromPath(path) {
        if (!path) return "Unknown Project";
        const parts = path.split('/');
        let projectName = parts[parts.length - 1] || "Unnamed Project";
        // If the last part is numeric (like an ID) or empty, try the second to last part
        if ((projectName === "" || projectName.match(/^\d+$/)) && parts.length > 1) { 
            projectName = parts[parts.length - 2] || "Unnamed Project";
        }
        projectName = projectName.replace(/^piscine-/, '').replace(/^quest-/, '');
        return projectName.split('-').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
    }

    generateCharts(isResize = false) {
        const dataToUse = isResize && this.lastFetchedDataForResize ? this.lastFetchedDataForResize : this.userData;
        if (dataToUse) {
            // XP by project chart still uses the list of transactions
            this.renderXPByProjectChart(document.getElementById('xpByProjectChart'), dataToUse.transactions || []);
            this.renderSkillsChart(document.getElementById('skillsChart'), dataToUse.skills || []);
        }
    }

    renderXPByProjectChart(svgElement, xpTransactions) {
        if (!svgElement) return;
        const projectXP = {};
        // Filter for actual XP transactions with a valid amount for the chart
        const filteredXpTransactions = xpTransactions.filter(tx => (!tx.type || tx.type === 'xp') && typeof tx.amount === 'number' && tx.amount > 0);

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

        svgElement.innerHTML = ''; // Clear previous chart

        const svgWidth = svgElement.clientWidth || 500;
        const svgHeight = parseInt(svgElement.getAttribute('height')) || 380;
        const margin = { top: 40, right: 30, bottom: 120, left: 70 }; // Adjusted bottom margin for labels
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
        
        const barPadding = 0.3; // Relative padding
        const barWidth = chartWidth / topProjects.length * (1 - barPadding);
        const scaleY = val => chartHeight - (val / (maxXP || 1)) * chartHeight; // Prevent division by zero

        // X-axis labels (rotated project names)
        topProjects.forEach((project, i) => {
            const x = margin.left + i * (chartWidth / topProjects.length) + (chartWidth / topProjects.length * barPadding / 2) + barWidth / 2; // Center of the bar group
            const textEl = document.createElementNS("http://www.w3.org/2000/svg", "text");
            textEl.setAttribute("x", x);
            textEl.setAttribute("y", svgHeight - margin.bottom + 25); // Position below axis
            textEl.setAttribute("text-anchor", "end");
            textEl.setAttribute("transform", `rotate(-55 ${x} ${svgHeight - margin.bottom + 25})`);
            textEl.setAttribute("font-size", "10px");
            textEl.setAttribute("fill", "#CBD5E0");
            let projectNameText = project[0];
            if (projectNameText.length > 15) projectNameText = projectNameText.substring(0, 12) + "...";
            textEl.textContent = projectNameText;
            svgElement.appendChild(textEl);
        });

        // Y-axis with grid lines and labels
        const yAxisGroup = document.createElementNS("http://www.w3.org/2000/svg", "g");
        yAxisGroup.setAttribute("transform", `translate(${margin.left}, ${margin.top})`);
        svgElement.appendChild(yAxisGroup);

        const numTicks = 5; // Number of ticks/gridlines
        for (let i = 0; i <= numTicks; i++) {
            const val = Math.round((maxXP / numTicks) * i);
            const yPos = scaleY(val);
            // Grid line
            const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
            line.setAttribute("x1", 0); line.setAttribute("y1", yPos);
            line.setAttribute("x2", chartWidth); line.setAttribute("y2", yPos);
            line.setAttribute("stroke", "#4A5568"); // Tailwind gray-700
            line.setAttribute("stroke-dasharray", "3,3");
            yAxisGroup.appendChild(line);
            // Tick label
            const textEl = document.createElementNS("http://www.w3.org/2000/svg", "text");
            textEl.setAttribute("x", -12); textEl.setAttribute("y", yPos + 4);
            textEl.setAttribute("text-anchor", "end"); textEl.setAttribute("font-size", "11px");
            textEl.setAttribute("fill", "#A0AEC0"); // Tailwind gray-400
            textEl.textContent = val.toLocaleString();
            yAxisGroup.appendChild(textEl);
        }
        // Y-axis title
        const yAxisTitle = document.createElementNS("http://www.w3.org/2000/svg", "text");
        yAxisTitle.setAttribute("transform", "rotate(-90)");
        yAxisTitle.setAttribute("y", margin.left / 2 - 35 ); // Adjust position
        yAxisTitle.setAttribute("x", -(margin.top + chartHeight / 2));
        yAxisTitle.setAttribute("text-anchor", "middle"); yAxisTitle.setAttribute("font-size", "13px");
        yAxisTitle.setAttribute("font-weight", "500"); yAxisTitle.setAttribute("fill", "#E2E8F0"); // Tailwind gray-200
        yAxisTitle.textContent = "XP Amount";
        svgElement.appendChild(yAxisTitle);


        // Bars with tooltips and values
        topProjects.forEach((project, i) => {
            const x = margin.left + i * (chartWidth / topProjects.length) + (chartWidth / topProjects.length * barPadding / 2);
            const y = margin.top + scaleY(project[1]);
            const h = chartHeight - scaleY(project[1]);
            const w = barWidth;

            const rect = document.createElementNS("http://www.w3.org/2000/svg", "rect");
            rect.setAttribute("x", x); rect.setAttribute("y", y);
            rect.setAttribute("width", Math.max(0, w)); rect.setAttribute("height", Math.max(0, h)); // Ensure non-negative
            rect.setAttribute("fill", "url(#barGradient)");
            rect.setAttribute("rx", "3"); rect.setAttribute("ry", "3"); // Rounded corners
            rect.classList.add("chart-bar");

            // Tooltip
            const titleEl = document.createElementNS("http://www.w3.org/2000/svg", "title");
            titleEl.textContent = `${project[0]}: ${project[1].toLocaleString()} XP`;
            rect.appendChild(titleEl);
            svgElement.appendChild(rect);

            // Value text on top of bar (if space permits)
            if (h > 15) { // Only show if bar is tall enough
                const valueText = document.createElementNS("http://www.w3.org/2000/svg", "text");
                valueText.setAttribute("x", x + w / 2); valueText.setAttribute("y", y - 7); // Position above bar
                valueText.setAttribute("text-anchor", "middle"); valueText.setAttribute("font-size", "10px");
                valueText.setAttribute("font-weight", "600"); valueText.setAttribute("fill", "#C3DAFE"); // Lighter purple/blue
                valueText.textContent = project[1].toLocaleString(); 
                svgElement.appendChild(valueText);
            }
        });
        
        // Define gradient for bars
        const defs = document.createElementNS("http://www.w3.org/2000/svg", "defs");
        const linearGradient = document.createElementNS("http://www.w3.org/2000/svg", "linearGradient");
        linearGradient.setAttribute("id", "barGradient");
        linearGradient.setAttribute("x1", "0%"); linearGradient.setAttribute("y1", "0%");
        linearGradient.setAttribute("x2", "0%"); linearGradient.setAttribute("y2", "100%");
        const stop1 = document.createElementNS("http://www.w3.org/2000/svg", "stop");
        stop1.setAttribute("offset", "0%");
        stop1.setAttribute("style", "stop-color:#A78BFA;stop-opacity:1"); // Tailwind purple-400
        const stop2 = document.createElementNS("http://www.w3.org/2000/svg", "stop");
        stop2.setAttribute("offset", "100%");
        stop2.setAttribute("style", "stop-color:#7C3AED;stop-opacity:1"); // Tailwind purple-600
        linearGradient.appendChild(stop1);
        linearGradient.appendChild(stop2);
        defs.appendChild(linearGradient);
        svgElement.appendChild(defs);
    }

    renderSkillsChart(svgElement, skillsData) {
        if (!svgElement) return;
        // Ensure skillsData is an array and has items
        if (!Array.isArray(skillsData) || skillsData.length === 0) {
            svgElement.innerHTML = `<text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle" fill="#A0AEC0" font-size="14px">No skills data available.</text>`;
            return;
        }

        // Aggregate skills: take the max amount for each skill type if duplicates exist
        const skillsMap = {};
        skillsData.forEach(skill => {
            const skillType = skill.type.replace(/^skill_/, ''); // Normalize skill type name
            if (!skillsMap[skillType] || skillsMap[skillType] < skill.amount) {
                skillsMap[skillType] = skill.amount;
            }
        });

        const aggregatedSkills = Object.entries(skillsMap)
            .map(([type, amount]) => ({ type: `skill_${type}`, amount })) // Reconstruct skill object
            .sort((a, b) => b.amount - a.amount); // Sort by amount desc

        const topSkills = aggregatedSkills.slice(0, 10); // Take top 10 skills
        if (topSkills.length === 0) { // Should not happen if skillsData was not empty initially
             svgElement.innerHTML = `<text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle" fill="#A0AEC0" font-size="14px">No skill data to display.</text>`;
            return;
        }

        svgElement.innerHTML = ''; // Clear previous chart content

        const svgWidth = svgElement.clientWidth || 500;
        const svgHeight = parseInt(svgElement.getAttribute('height')) || 400; 
        const margin = { top: 40, right: 30, bottom: 100, left: 70 }; // Adjusted margins
        const chartWidth = svgWidth - margin.left - margin.right;
        const chartHeight = svgHeight - margin.top - margin.bottom;
        
        if (chartWidth <= 0 || chartHeight <= 0) {
            svgElement.innerHTML = `<text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle" fill="#A0AEC0" font-size="14px">Chart cannot be rendered (too small).</text>`;
            return;
        }

        const maxAmount = Math.max(...topSkills.map(s => s.amount), 0); // Ensure maxAmount is at least 0
        if (maxAmount === 0 && topSkills.length > 0) {
            svgElement.innerHTML = `<text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle" fill="#A0AEC0" font-size="14px">All skills have 0% progress.</text>`;
            return;
        }

        const barPadding = 0.3; // Relative padding
        const barWidth = chartWidth / topSkills.length * (1 - barPadding);
        const scaleY = val => (val / (maxAmount || 1)) * chartHeight; // Scale value to bar height, prevent division by zero

        const chartGroup = document.createElementNS("http://www.w3.org/2000/svg", "g");
        chartGroup.setAttribute("transform", `translate(${margin.left}, ${margin.top})`);
        svgElement.appendChild(chartGroup);

        // X-axis labels (skill names)
        topSkills.forEach((skill, i) => {
            const x = i * (chartWidth / topSkills.length) + (chartWidth / topSkills.length * barPadding / 2); // Start of bar group
            const barHeight = scaleY(skill.amount);
            const y = chartHeight - barHeight; // Y position for top of the bar

            const textEl = document.createElementNS("http://www.w3.org/2000/svg", "text");
            textEl.setAttribute("x", x + barWidth / 2); // Center of the bar
            textEl.setAttribute("y", chartHeight + 25); // Position below x-axis line
            textEl.setAttribute("text-anchor", "end"); // Anchor to end for rotation
            textEl.setAttribute("transform", `rotate(-45 ${x + barWidth/2} ${chartHeight + 25})`);
            textEl.setAttribute("font-size", "11px");
            textEl.setAttribute("fill", "#CBD5E0"); // Tailwind gray-300
            // Format skill name: remove "skill_", replace underscores, capitalize
            let skillName = skill.type.replace(/^skill_/, '').replace(/_/g, ' ').replace(/-/g, ' ');
            skillName = skillName.split(' ').map(word => 
                word.charAt(0).toUpperCase() + word.slice(1)
            ).join(' ');
            if (skillName.length > 12) skillName = skillName.substring(0, 9) + "..."; // Truncate long names
            textEl.textContent = skillName;
            chartGroup.appendChild(textEl);

            // Create bar
            const rect = document.createElementNS("http://www.w3.org/2000/svg", "rect");
            rect.setAttribute("x", x);
            rect.setAttribute("y", y);
            rect.setAttribute("width", Math.max(0, barWidth)); // Ensure non-negative
            rect.setAttribute("height", Math.max(0, barHeight)); // Ensure non-negative
            rect.setAttribute("fill", "url(#skillBarGradient)");
            rect.setAttribute("rx", "3"); // Rounded corners
            rect.setAttribute("ry", "3");
            rect.classList.add("chart-bar");

            // Tooltip
            const titleEl = document.createElementNS("http://www.w3.org/2000/svg", "title");
            titleEl.textContent = `${skillName}: ${skill.amount}%`;
            rect.appendChild(titleEl);
            chartGroup.appendChild(rect);

             // Value text on top of bar
            if (barHeight > 15) {
                const valueText = document.createElementNS("http://www.w3.org/2000/svg", "text");
                valueText.setAttribute("x", x + barWidth / 2);
                valueText.setAttribute("y", y - 5); // Position above the bar
                valueText.setAttribute("text-anchor", "middle");
                valueText.setAttribute("font-size", "10px");
                valueText.setAttribute("font-weight", "600");
                valueText.setAttribute("fill", "#C3DAFE"); // Light pink/purple
                valueText.textContent = skill.amount + "%";
                chartGroup.appendChild(valueText);
            }
        });

        // Y-axis with grid lines and labels
        const yAxisGroup = document.createElementNS("http://www.w3.org/2000/svg", "g");
        chartGroup.appendChild(yAxisGroup);

        const numYTicks = 5; // Number of ticks on Y-axis
        for (let i = 0; i <= numYTicks; i++) {
            const val = Math.round((maxAmount / numYTicks) * i);
            const yPos = chartHeight - scaleY(val); // Y position for the tick
            
            // Grid line
            const gridLine = document.createElementNS("http://www.w3.org/2000/svg", "line");
            gridLine.setAttribute("x1", 0); 
            gridLine.setAttribute("y1", yPos);
            gridLine.setAttribute("x2", chartWidth); 
            gridLine.setAttribute("y2", yPos);
            gridLine.setAttribute("stroke", "#4A5568"); // Tailwind gray-700
            gridLine.setAttribute("stroke-dasharray", "2,2");
            yAxisGroup.appendChild(gridLine);
            
            // Tick label
            const tickText = document.createElementNS("http://www.w3.org/2000/svg", "text");
            tickText.setAttribute("x", -10); 
            tickText.setAttribute("y", yPos + 4); // Adjust for vertical alignment
            tickText.setAttribute("text-anchor", "end"); 
            tickText.setAttribute("font-size", "10px");
            tickText.setAttribute("fill", "#A0AEC0"); // Tailwind gray-400
            tickText.textContent = val + "%";
            yAxisGroup.appendChild(tickText);
        }

        // Y-axis Title
        const yAxisTitle = document.createElementNS("http://www.w3.org/2000/svg", "text");
        yAxisTitle.setAttribute("transform", "rotate(-90)");
        yAxisTitle.setAttribute("x", -(chartHeight / 2)); 
        yAxisTitle.setAttribute("y", -margin.left + 20); // Position to the left of Y-axis
        yAxisTitle.setAttribute("text-anchor", "middle");
        yAxisTitle.setAttribute("font-size", "12px");
        yAxisTitle.setAttribute("font-weight", "600");
        yAxisTitle.setAttribute("fill", "#E2E8F0"); // Tailwind gray-200
        yAxisTitle.textContent = "Skill Level (%)";
        chartGroup.appendChild(yAxisTitle);

        // Define gradient for skill bars
        const defs = document.createElementNS("http://www.w3.org/2000/svg", "defs");
        const skillGradient = document.createElementNS("http://www.w3.org/2000/svg", "linearGradient");
        skillGradient.setAttribute("id", "skillBarGradient");
        skillGradient.setAttribute("x1", "0%"); 
        skillGradient.setAttribute("y1", "0%");
        skillGradient.setAttribute("x2", "0%"); 
        skillGradient.setAttribute("y2", "100%");
        
        const stopS1 = document.createElementNS("http://www.w3.org/2000/svg", "stop");
        stopS1.setAttribute("offset", "0%");
        stopS1.setAttribute("style", "stop-color:#F472B6;stop-opacity:1"); // Tailwind pink-400
        
        const stopS2 = document.createElementNS("http://www.w3.org/2000/svg", "stop");
        stopS2.setAttribute("offset", "100%");
        stopS2.setAttribute("style", "stop-color:#EC4899;stop-opacity:1"); // Tailwind pink-500
        
        skillGradient.appendChild(stopS1);
        skillGradient.appendChild(stopS2);
        defs.appendChild(skillGradient);
        svgElement.appendChild(defs); // Append defs to the main SVG element
    }
}

// Initialize the app when the DOM is fully loaded
document.addEventListener('DOMContentLoaded', () => {
    new GraphQLProfileApp();
});

