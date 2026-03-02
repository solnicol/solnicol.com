---
layout: default
title: "Now"
permalink: /now/
og_title: "Sol Nicol — Now"
og_description: "Active build loop: stabilising ZIGGY’s memory spine, fixing the vault tunnel, and mapping Scotland’s DeFi proof-of-work."
og_image: /og.jpg
---

{% assign now = site.data.now %}

<div class="hero">
  <img src="/assets/images/profile.png" alt="Sol Nicol" class="hero-photo" width="130" height="130" loading="lazy">
  <div>
    <p class="hero-kicker">{{ now.hero.kicker }}</p>
    <p class="hero-name">{{ now.hero.name }}</p>
    <p class="hero-intro">{{ now.hero.intro }}</p>
  </div>
</div>

<div class="bio">
  {{ now.bio }}
</div>

<h3>What I'm doing now</h3>

<div class="build-list">
  {% for item in now.doing %}
    <div class="build-item">
      <strong>{{ item.title }}</strong>
      <p>{{ item.description }}</p>
    </div>
  {% endfor %}
</div>

<h3>Current experiments</h3>

<div class="build-list">
  {% for item in now.experiments %}
    <div class="build-item">
      <strong>{{ item.title }}</strong>
      <p>{{ item.description }}</p>
    </div>
  {% endfor %}
</div>

<ul class="links">
  {% for link in now.links %}
    <li><a href="{{ link.url }}">{{ link.label }}</a></li>
  {% endfor %}
</ul>
