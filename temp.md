{% if partial_mode %}
    {% for video in videos %}
    <article id="card-{{ video['video_id'] }}" data-status="{{ video['status'] }}" class="bg-white shadow-md overflow-hidden hover:shadow-lg transition-shadow duration-300 flex flex-col dark:bg-black dark:shadow-gray-900 video-card">
        <div class="aspect-video w-full bg-black"><iframe class="w-full h-full" src="https://www.youtube.com/embed/{{ video['video_id'] }}?rel=0" frameborder="0" allowfullscreen></iframe></div>
        <div class="p-6 flex-1 flex flex-col justify-between">
            <div>
                <h3 class="text-xl font-bold leading-tight mb-3 line-clamp-2 dark:text-white">{{ video['title'] }}</h3>
                <div class="flex justify-between items-start mb-6">
                    <div>
                        <p class="text-base text-gray-500 font-bold truncate pr-4 mt-0.5 dark:text-gray-400">{{ video['channel_name'] }}</p>
                        
                        {% if video['is_new'] %}
                            <span class="status-pill status-green mt-1 inline-block">New</span>
                        {% endif %}

                        {% if page == 'channel_view' %}
                            {% if video['status'] == 'new' %}
                                <span class="status-pill status-green mt-1 inline-block">Unwatched</span>
                            {% elif video['status'] == 'archived' %}
                                <span class="status-pill status-blue mt-1 inline-block">Archived</span>
                            {% endif %}
                        {% endif %}
                    </div>
                    <div class="flex flex-col gap-1 items-end shrink-0">
                        {% if video['tags_string'] %}
                            {% for tag in video['tags_string'].split(',') %}
                            <span data-tag="{{ tag.strip() }}" class="tag-pill">{{ tag.strip() }}</span>
                            {% endfor %}
                        {% else %}
                            <span class="text-sm font-bold bg-gray-50 text-gray-400 px-3 py-1 border border-gray-100 dark:bg-gray-900 dark:border-gray-800 dark:text-gray-600">Uncategorized</span>
                        {% endif %}
                    </div>
                </div>
            </div>
            <div class="pt-4 mt-2 border-t border-gray-100 dark:border-gray-800">
                {% if page == 'inbox' or (page == 'channel_view' and video['status'] == 'new') %}
                    <button onclick="openVideoActionModal('{{ video['video_id'] }}')" class="action-btn w-full bg-gray-800 hover:bg-black text-white text-lg font-bold py-3 px-4 transition-colors shadow-sm dark:bg-gray-700 dark:hover:bg-gray-600">I'm done watching</button>
                {% else %}
                    <button onclick="confirmArchiveRemoval('{{ video['video_id'] }}')" class="action-btn destructive-hover w-full bg-red-50 hover:bg-red-100 text-red-600 text-lg font-bold py-3 px-4 transition-colors dark:bg-red-900/20 dark:text-red-400 dark:hover:bg-red-900/40">Remove</button>
                {% endif %}
            </div>
        </div>
    </article>
    {% else %}
    <div class="col-span-full text-center py-20 text-gray-500 text-2xl font-bold dark:text-gray-400">
        {% if page == 'inbox' %} <p>No videos match your current intention.</p> 
        {% elif page == 'channel_view' %} <p>No videos found for this channel.</p>
        {% else %} Archive is empty. {% endif %}
    </div>
    {% endfor %}

{% else %}
<!DOCTYPE html>
<html lang="en" class="light">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Distill Tube</title>
    <link rel="stylesheet" href="{{ url_for('static', filename='style.css') }}">
    <script src="https://cdn.tailwindcss.com"></script>
    <script>
        tailwind.config = {
            darkMode: 'class', 
            theme: { extend: { colors: { gray: { 900: '#1a1a1a', 800: '#2d2d2d', 100: '#f5f5f5', } } } }
        }
    </script>
</head>
<body class="bg-gray-100 text-gray-900 font-mono antialiased relative text-base dark:bg-gray-900 dark:text-gray-100 transition-colors duration-300">

    <header class="bg-white shadow-sm sticky top-0 z-50 dark:bg-black dark:border-b dark:border-gray-800">
        <div class="w-full px-12 py-6 flex justify-between items-center gap-10">
            
            <div class="flex items-center gap-8 min-w-0">
                <h1 class="text-3xl font-extrabold tracking-tight dark:text-white whitespace-nowrap">Distill Tube</h1>
                
                {% if page != 'gatekeeper' %}
                <nav class="flex gap-6 items-center text-xl font-bold">
                    <a href="/?nav=1" class="{{ 'pointer-text' if page == 'inbox' else 'nav-link text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white' }} transition-colors">
                        <div class="flex flex-col items-center leading-none">
                            <span>Inbox</span>
                            {% if page == 'inbox' %}
                                <span id="nav-count-inbox" class="text-xl font-bold mt-1">{{ videos|length }}{% if inbox_fresh_count and inbox_fresh_count > 0 %}<span class="text-deep-green ml-2">[{{inbox_fresh_count}}]</span>{% endif %}</span>
                            {% endif %}
                        </div>
                    </a>
                    
                    <a href="/archive" class="{{ 'pointer-text' if page == 'archive' else 'nav-link text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white' }} transition-colors">
                        <div class="flex flex-col items-center leading-none">
                            <span>Archive</span>
                            {% if page == 'archive' %}
                                <span id="nav-count-archive" class="text-xl font-bold mt-1">{{ videos|length }}</span>
                            {% endif %}
                        </div>
                    </a>
                    
                    <a href="/channels" class="{{ 'pointer-text' if page == 'channels' else 'nav-link text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white' }} transition-colors">Channels</a>
                    
                    {% if active_channel %}
                        <span class="text-gray-300 dark:text-gray-700">/</span>
                        
                        <div class="max-w-[250px] whitespace-normal leading-tight text-center flex items-center">
                            <a href="javascript:void(0)" 
                               onclick="tryOpenChannel({{ active_channel['id'] }})"
                               class="{{ 'pointer-text' if page == 'channel_view' else 'nav-link text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white' }} text-xl font-bold transition-colors">
                                {{ active_channel['name'] }}
                            </a>
                        </div>
                        
                        {% if page == 'channel_view' %}
                            <button id="filter-btn-new" onclick="toggleChannelFilter('new')" class="filter-btn filter-on-green ml-2 flex flex-col items-center leading-none">
                                <span>Unwatched</span>
                                <span id="channel-count-new" class="text-xl text-green-600 font-bold mt-1 dark:text-green-400">{{ unwatched_count }}{% if channel_fresh_count and channel_fresh_count > 0 %}<span class="text-deep-green ml-2">[{{ channel_fresh_count }}]</span>{% endif %}</span>
                            </button>
                            
                            <button id="filter-btn-archived" onclick="toggleChannelFilter('archived')" class="filter-btn filter-on-blue ml-4 flex flex-col items-center leading-none">
                                <span>Archived</span>
                                <span id="channel-count-archived" class="text-xl text-blue-600 font-bold mt-1 dark:text-blue-400">{{ archived_count }}</span>
                            </button>
                        {% endif %}
                        
                        <a href="#" onclick="exitChannel()" class="nav-link-return text-gray-500 hover:text-red-600 dark:text-gray-400 dark:hover:text-red-500 transition-colors ml-2">Return</a>
                    {% endif %}
                </nav>
                {% endif %}
            </div>
            
            {% if page != 'gatekeeper' %}
            <div class="flex items-center gap-6 shrink-0">
                <a href="/settings" class="{{ 'pointer-text' if page == 'settings' else 'nav-link text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white' }} font-bold text-xl transition-colors">Settings</a>
            </div>
            {% endif %}
        </div>
    </header>

    <main class="w-full {{ 'px-12 py-8' if page != 'settings' else '' }}">
        
        {% if page == 'gatekeeper' %}
        <div class="max-w-3xl mx-auto text-center mt-20">
            <h2 class="text-5xl font-extrabold text-gray-900 mb-6 tracking-tight dark:text-white">What is your intention?</h2>
            <p class="text-xl text-gray-500 mb-12 font-medium dark:text-gray-400">Select the tags you need for this session.</p>
            <div class="flex flex-wrap justify-center gap-4 mb-12" id="category-selector">
                {% for cat in gatekeeper_tags %}
                <button onclick="toggleCategory(this, '{{ cat }}')" data-tag="{{ cat }}" class="cat-btn font-bold text-xl py-3 px-6 select-none shadow-sm {{ 'selected' if cat in preselected_tags else '' }}">{{ cat }}</button>
                {% endfor %}
            </div>
            <button id="enter-focus-btn" onclick="enterFeed()" class="action-btn bg-black text-white text-3xl font-bold py-4 px-12 hover:bg-gray-800 shadow-xl border-4 border-transparent dark:bg-white dark:text-black dark:hover:bg-gray-200">Enter Focus Mode</button>
        </div>
        
        {% elif page == 'settings' %}
        <div class="bg-white flex w-full min-h-[calc(100vh-65px)] dark:bg-black">
            <div class="w-64 border-r-2 border-gray-200 pt-8 px-6 dark:border-gray-800">
                <h3 class="text-sm font-bold text-gray-400 uppercase tracking-wider mb-4">Sections</h3>
                <div class="flex flex-col gap-1">
                    <button onclick="switchSettingsTab('visual')" id="tab-btn-visual" class="tab-btn text-left text-lg font-bold py-2 px-4 transition-colors active">Visual</button>
                    <button onclick="switchSettingsTab('tags')" id="tab-btn-tags" class="tab-btn text-left text-lg font-bold py-2 px-4 transition-colors">Tags</button>
                    <button onclick="switchSettingsTab('distill')" id="tab-btn-distill" class="tab-btn text-left text-lg font-bold py-2 px-4 transition-colors">Distill Interval</button>
                    <button onclick="switchSettingsTab('data')" id="tab-btn-data" class="tab-btn text-left text-lg font-bold py-2 px-4 transition-colors">Data</button>
                </div>
            </div>
            <div class="flex-1 p-12 overflow-hidden">
                <div id="settings-content-visual">
                    <h2 class="text-3xl font-extrabold text-gray-900 mb-8 dark:text-white">Visual Settings</h2>
                    <div class="flex items-center justify-between border-2 border-gray-200 p-6 mb-6 dark:border-gray-700">
                        <div><h4 class="text-xl font-bold text-gray-900 mb-1 dark:text-white">Theme Mode</h4><p class="text-base text-gray-500 dark:text-gray-400">Switch between light and dark appearance.</p></div>
                        <div onclick="toggleTheme()" class="w-32 h-12 border-2 border-black dark:border-white relative flex items-center justify-between px-3 cursor-pointer bg-white dark:bg-black select-none transition-colors">
                            <span class="text-sm font-bold text-white z-0">Light</span><span class="text-sm font-bold text-black z-0">Dark</span>
                            <div id="theme-toggle-square" class="absolute top-1 bottom-1 w-10 bg-black dark:bg-white transition-all duration-300 left-1 z-10 shadow-sm"></div>
                        </div>
                    </div>
                    <div class="border-2 border-gray-200 p-6 dark:border-gray-700">
                        <div class="mb-4"><h4 class="text-xl font-bold text-gray-900 mb-1 dark:text-white">Interact Color</h4><p class="text-base text-gray-500 dark:text-gray-400">Used for active states.</p></div>
                        
                        <div class="flex flex-col gap-3 mb-6">
                            <div class="flex flex-wrap gap-2">
                                <button onclick="setInteractColor('#FFB3BA')" class="w-10 h-10 bg-[#FFB3BA] border-2 border-transparent shadow-sm"></button> <button onclick="setInteractColor('#FFDFBA')" class="w-10 h-10 bg-[#FFDFBA] border-2 border-transparent shadow-sm"></button> <button onclick="setInteractColor('#FFFFBA')" class="w-10 h-10 bg-[#FFFFBA] border-2 border-transparent shadow-sm"></button> <button onclick="setInteractColor('#BAFFC9')" class="w-10 h-10 bg-[#BAFFC9] border-2 border-transparent shadow-sm"></button> <button onclick="setInteractColor('#67E8F9')" class="w-10 h-10 bg-[#67E8F9] border-2 border-transparent shadow-sm"></button> <button onclick="setInteractColor('#C2D4FF')" class="w-10 h-10 bg-[#C2D4FF] border-2 border-transparent shadow-sm"></button> <button onclick="setInteractColor('#D8B4FE')" class="w-10 h-10 bg-[#D8B4FE] border-2 border-transparent shadow-sm"></button> <button onclick="setInteractColor('#FFC0CB')" class="w-10 h-10 bg-[#FFC0CB] border-2 border-transparent shadow-sm"></button> </div>
                            <div class="flex flex-wrap gap-2">
                                <button onclick="setInteractColor('#FF073A')" class="w-10 h-10 bg-[#FF073A] border-2 border-transparent shadow-sm"></button>
                                <button onclick="setInteractColor('#FF5F1F')" class="w-10 h-10 bg-[#FF5F1F] border-2 border-transparent shadow-sm"></button>
                                <button onclick="setInteractColor('#FFFF00')" class="w-10 h-10 bg-[#FFFF00] border-2 border-transparent shadow-sm"></button>
                                <button onclick="setInteractColor('#39FF14')" class="w-10 h-10 bg-[#39FF14] border-2 border-transparent shadow-sm"></button>
                                <button onclick="setInteractColor('#00FFFF')" class="w-10 h-10 bg-[#00FFFF] border-2 border-transparent shadow-sm"></button>
                                <button onclick="setInteractColor('#1F51FF')" class="w-10 h-10 bg-[#1F51FF] border-2 border-transparent shadow-sm"></button>
                                <button onclick="setInteractColor('#BC13FE')" class="w-10 h-10 bg-[#BC13FE] border-2 border-transparent shadow-sm"></button>
                                <button onclick="setInteractColor('#FF00FF')" class="w-10 h-10 bg-[#FF00FF] border-2 border-transparent shadow-sm"></button>
                            </div>
                        </div>

                        <div class="flex gap-3 items-center"><label class="text-lg font-bold dark:text-white">Hex:</label><input type="text" id="interact-color-input" class="border-2 border-gray-300 p-2 text-lg font-mono uppercase w-32 dark:bg-black dark:border-gray-700 dark:text-white" placeholder="#FFF01F"><button onclick="saveCustomInteractColor()" class="action-btn bg-black text-white px-4 py-2 font-bold text-lg hover:bg-gray-800 dark:bg-white dark:text-black">Apply</button></div>
                    </div>
                </div>
                <div id="settings-content-tags" class="hidden h-full flex flex-col">
                    <div class="flex justify-between items-center mb-8">
                        <h2 class="text-3xl font-extrabold text-gray-900 dark:text-white">Tags Customization</h2>
                        <button onclick="openTagEditModal(null)" class="action-btn bg-black text-white text-base font-bold py-2 px-4 hover:bg-gray-800 dark:bg-white dark:text-black flex items-center gap-1">
                            <span class="text-xl leading-none pb-1">+</span> Add Tag
                        </button>
                    </div>
                    <div class="flex-1 overflow-y-auto custom-scrollbar border-2 border-gray-200 dark:border-gray-700 max-h-[500px]">
                        <div id="tags-settings-list" class="flex flex-col"></div>
                    </div>
                </div>
                
                <div id="settings-content-distill" class="hidden h-full flex flex-col">
                    <div class="flex justify-between items-center mb-8">
                        <h2 class="text-3xl font-extrabold text-gray-900 dark:text-white">Distill Interval</h2>
                        <button onclick="toggleDistillConfig()" class="action-btn bg-white text-gray-900 border-2 border-gray-200 text-base font-bold py-2 px-4 hover:border-black dark:bg-black dark:text-white dark:border-gray-700 dark:hover:border-white transition-colors">Config</button>
                    </div>
                    
                    <div class="flex flex-1 overflow-hidden relative">
                        <div id="distill-focus-area" class="flex-1 transition-all duration-500 ease-in-out flex flex-col justify-start">
                            <div class="mb-12">
                                <p class="text-base text-gray-500 mb-6 max-w-xl dark:text-gray-400">Distill Tube runs in the background. Choose how often you want to check for new videos.</p>
                                
                                <div class="mb-8 p-4 border-2 border-gray-200 bg-gray-50 dark:bg-gray-800 dark:border-gray-700 inline-block w-full max-w-2xl">
                                    <span class="block text-sm font-bold text-gray-400 mb-1 uppercase tracking-wider">Next Update In</span>
                                    <span id="distill-timer" class="text-4xl font-mono font-extrabold text-gray-900 dark:text-white block break-words">--:--:--:--</span>
                                </div>
        
                                <div class="flex items-center gap-4">
                                    <input type="number" id="interval-input" value="{{ current_interval }}" min="1" class="border-2 border-gray-300 p-3 text-xl font-mono w-32 dark:bg-black dark:border-gray-700 dark:text-white text-center">
                                    <span class="text-xl font-bold dark:text-white">Minutes</span>
                                    <button onclick="saveInterval()" id="save-interval-btn" class="action-btn bg-black text-white text-xl font-bold py-3 px-8 hover:bg-gray-800 transition-colors shadow-md border-4 border-transparent dark:bg-white dark:text-black dark:hover:bg-gray-200 ml-4">Set Interval</button>
                                </div>
                            </div>
                        </div>

                        <div id="distill-config-panel" class="w-0 opacity-0 overflow-hidden transition-all duration-500 ease-in-out border-l-0 border-gray-200 dark:border-gray-800 flex flex-col bg-gray-50 dark:bg-gray-900/50">
                            </div>
                    </div>
                </div>

                <div id="settings-content-data" class="hidden">
                    <h2 class="text-3xl font-extrabold text-gray-900 mb-8 dark:text-white">Data Management</h2>
                    <div class="mb-12 border border-red-200 bg-red-50 p-6 dark:bg-red-900/20 dark:border-red-900"><h4 class="text-xl font-bold text-red-800 mb-2 dark:text-red-400">Purge All Videos</h4><p class="text-base text-red-700 mb-6 dark:text-red-300">This will delete ALL videos from the database.</p><button onclick="purgeVideos()" class="action-btn destructive-hover bg-red-600 text-white text-xl font-bold py-3 px-8 hover:bg-red-700 transition-colors shadow-sm">Purge Videos</button></div>
                </div>
            </div>
        </div>